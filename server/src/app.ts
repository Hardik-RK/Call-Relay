import { createHash, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Config } from './config.ts';
import { RateLimiter } from './limiter.ts';
import { MAX_DIAL_STRING, normalizePhone, validateDialString, type DialStringFailure, type PhoneFailure } from './phone.ts';
import { ONLINE_WINDOW_MS, Store, type Device } from './store.ts';

const MAX_BODY_BYTES = 4096;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const FAILURE_TEXT: Record<PhoneFailure, string> = {
  empty: 'Enter a phone number.',
  invalid_characters: 'Use digits, spaces, dashes and an optional leading +.',
  too_short: 'That number is too short.',
  too_long: 'That number is too long.',
  invalid_for_country: 'That does not look like a valid number for its country.',
};

const DIAL_FAILURE_TEXT: Record<DialStringFailure, string> = {
  empty: 'Enter something to dial.',
  too_long: `That is too long (at most ${MAX_DIAL_STRING} characters).`,
  invalid_characters: 'That contains characters a phone cannot dial.',
};

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;
  readonly headers: Record<string, string>;
  constructor(
    status: number,
    code: string,
    message: string,
    extra: Record<string, unknown> = {},
    headers: Record<string, string> = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
    this.headers = headers;
  }
}

export interface App {
  server: Server;
  store: Store;
}

export interface AppOptions {
  now?: () => number;
  publicDir?: string;
}

const digest = (s: string) => createHash('sha256').update(s).digest();
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export function createApp(config: Config, options: AppOptions = {}): App {
  const now = options.now ?? Date.now;
  const publicDir = options.publicDir ?? fileURLToPath(new URL('../public/', import.meta.url));
  const store = new Store(config.dataFile, config.commandTtlMs, now);

  const limits = {
    pair: new RateLimiter(5, 60_000, now),
    pairingCode: new RateLimiter(5, 60_000, now),
    call: new RateLimiter(10, 60_000, now),
    authFail: new RateLimiter(10, 60_000, now),
    poll: new RateLimiter(120, 60_000, now),
    web: new RateLimiter(240, 60_000, now),
  };
  const throttle = (limiter: RateLimiter, key: string) => {
    const retry = limiter.hit(key);
    if (retry > 0) {
      throw new HttpError(429, 'rate_limited', 'Too many requests, slow down.', { retryAfter: retry }, {
        'retry-after': String(retry),
      });
    }
  };

  /** After too many failed logins from one address, refuse even correct credentials for a while. */
  const blockIfLocked = (key: string) => {
    const retry = limits.authFail.blocked(key);
    if (retry > 0) {
      throw new HttpError(429, 'rate_limited', 'Too many failed attempts.', { retryAfter: retry }, {
        'retry-after': String(retry),
      });
    }
  };

  const waiters = new Map<string, () => void>();
  store.on('queued', (deviceId: string) => waiters.get(deviceId)?.());

  // ---- request guards ----------------------------------------------------------------------

  function checkHost(req: IncomingMessage): string {
    const raw = (req.headers.host ?? '').toLowerCase();
    const host = raw.startsWith('[') ? raw.slice(0, raw.indexOf(']') + 1) : raw.split(':')[0]!;
    if (!LOOPBACK_HOSTS.has(host) && !config.allowedHosts.includes(host)) {
      // Blocks DNS-rebinding: a hostile page cannot reach us under a name we did not expect.
      throw new HttpError(421, 'bad_host', 'Unexpected Host header. Add it to ALLOWED_HOSTS if intended.');
    }
    return raw;
  }

  function clientKey(req: IncomingMessage): string {
    return req.socket.remoteAddress ?? 'unknown';
  }

  /** Guards for the browser-facing API: same-origin only, JSON only, access key when configured. */
  function webGuard(req: IncomingMessage, hostHeader: string): string {
    const ip = clientKey(req);
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let originHost = '';
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        // falls through to rejection
      }
      if (originHost !== hostHeader) throw new HttpError(403, 'bad_origin', 'Cross-origin requests are not allowed.');
    }
    if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'HEAD') {
      const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
      if (type !== 'application/json') {
        throw new HttpError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
      }
    }
    return ip;
  }

  function webAuth(req: IncomingMessage, ip: string): void {
    if (config.accessKey !== null) {
      blockIfLocked(`webauth:${ip}`);
      const given = req.headers['x-access-key'];
      if (typeof given !== 'string' || !sameSecret(given, config.accessKey)) {
        throttle(limits.authFail, `webauth:${ip}`); // only failures are counted
        throw new HttpError(401, 'unauthorized', 'Access key required.');
      }
    }
    throttle(limits.web, `web:${ip}`);
  }

  function deviceAuth(req: IncomingMessage): Device {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const key = `devauth:${clientKey(req)}`;
    blockIfLocked(key);
    const device = token ? store.authenticateDevice(token) : null;
    if (!device) {
      throttle(limits.authFail, key);
      throw new HttpError(401, 'unauthorized', 'Invalid device token.');
    }
    return device;
  }

  async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'Request body too large.');
      chunks.push(chunk as Buffer);
    }
    if (size === 0) return {};
    try {
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
      return value as Record<string, unknown>;
    } catch {
      throw new HttpError(400, 'bad_json', 'Body must be a JSON object.');
    }
  }

  // ---- responses ---------------------------------------------------------------------------

  function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    });
    res.end(JSON.stringify(body));
  }

  const deviceView = (d: Device) => ({
    id: d.id,
    name: d.name,
    online: now() - d.lastSeenAt < ONLINE_WINDOW_MS,
    lastSeenAt: d.lastSeenAt,
  });

  // ---- routes ------------------------------------------------------------------------------

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const hostHeader = checkHost(req);
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      const html = await readFile(`${publicDir}index.html`);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'referrer-policy': 'no-referrer',
        'content-security-policy':
          "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      });
      res.end(html);
      return;
    }

    if (method === 'GET' && path === '/app.js') {
      const js = await readFile(`${publicDir}app.js`).catch(() => null);
      if (js === null) throw new HttpError(404, 'not_found', 'app.js is missing. Run npm run build:web.');
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(js);
      return;
    }

    if (method === 'GET' && path === '/api/health') return send(res, 200, { ok: true });

    // ---- phone-facing API (bearer token) ----
    if (path === '/api/pair' && method === 'POST') {
      const ip = clientKey(req);
      throttle(limits.pair, `pair:${ip}`);
      const body = await readJson(req);
      const code = typeof body.code === 'string' ? body.code : '';
      const name = typeof body.deviceName === 'string' ? body.deviceName : '';
      const result = store.redeemCode(code, name);
      if (!result) throw new HttpError(403, 'invalid_code', 'Pairing code is invalid, expired or already used.');
      return send(res, 201, { deviceId: result.device.id, token: result.token });
    }

    if (path === '/api/device/commands' && method === 'GET') {
      const device = deviceAuth(req);
      throttle(limits.poll, `poll:${device.id}`);
      const wanted = Number(url.searchParams.get('wait') ?? '0');
      const waitMs = Math.min(Math.max(Number.isFinite(wanted) ? wanted * 1000 : 0, 0), config.pollWaitMs);
      let commands = store.takeQueued(device.id);
      if (commands.length === 0 && waitMs > 0) {
        await new Promise<void>((resolve) => {
          waiters.get(device.id)?.(); // a newer poll supersedes an older one
          const done = () => {
            clearTimeout(timer);
            if (waiters.get(device.id) === done) waiters.delete(device.id);
            req.off('close', done);
            resolve();
          };
          const timer = setTimeout(done, waitMs);
          waiters.set(device.id, done);
          req.on('close', done);
        });
        commands = res.destroyed ? [] : store.takeQueued(device.id);
      }
      return send(res, 200, {
        commands: commands.map((c) => ({
          id: c.id,
          type: 'dial',
          number: c.number,
          ...(c.raw ? { raw: true } : {}),
          createdAt: c.createdAt,
        })),
      });
    }

    const statusMatch = /^\/api\/device\/calls\/([0-9a-f-]{36})\/status$/.exec(path);
    if (statusMatch && method === 'POST') {
      const device = deviceAuth(req);
      const body = await readJson(req);
      if (body.state !== 'dialing' && body.state !== 'failed') {
        throw new HttpError(400, 'bad_state', 'state must be "dialing" or "failed".');
      }
      const reason = typeof body.reason === 'string' ? body.reason : undefined;
      const result = store.report(device.id, statusMatch[1]!, body.state, reason);
      if (result === 'not_found') throw new HttpError(404, 'not_found', 'Unknown call.');
      if (result === 'conflict') throw new HttpError(409, 'conflict', 'Call is not awaiting a report.');
      return send(res, 200, { ok: true });
    }

    if (path === '/api/device' && method === 'DELETE') {
      const device = deviceAuth(req);
      store.removeDevice(device.id);
      return send(res, 200, { ok: true });
    }

    // ---- web-facing API ----
    if (path.startsWith('/api/')) {
      const ip = webGuard(req, hostHeader);
      webAuth(req, ip);

      if (path === '/api/state' && method === 'GET') {
        return send(res, 200, {
          defaultCountry: config.defaultCountry,
          devices: store.listDevices().map(deviceView),
          calls: store.recent(10),
          pairingActive: store.hasActivePairingCode(),
        });
      }

      if (path === '/api/normalize' && method === 'GET') {
        if (url.searchParams.get('raw') === '1') {
          const d = validateDialString(url.searchParams.get('number') ?? '');
          return send(res, 200, d.ok ? d : { ok: false, reason: d.reason, message: DIAL_FAILURE_TEXT[d.reason] });
        }
        const r = normalizePhone(url.searchParams.get('number') ?? '', config.defaultCountry);
        return send(res, 200, r.ok ? r : { ok: false, reason: r.reason, message: FAILURE_TEXT[r.reason] });
      }

      if (path === '/api/pairing-code' && method === 'POST') {
        throttle(limits.pairingCode, `code:${ip}`);
        return send(res, 201, store.createPairingCode());
      }

      if (path === '/api/calls' && method === 'POST') {
        throttle(limits.call, `call:${ip}`);
        const body = await readJson(req);
        const input = typeof body.number === 'string' ? body.number : '';
        const raw = body.raw === true;
        let target: { value: string; display: string };
        if (raw) {
          const dial = validateDialString(input);
          if (!dial.ok) throw new HttpError(422, 'invalid_number', DIAL_FAILURE_TEXT[dial.reason], { reason: dial.reason });
          target = { value: dial.dial, display: dial.display };
        } else {
          const parsed = normalizePhone(input, config.defaultCountry);
          if (!parsed.ok) {
            throw new HttpError(422, 'invalid_number', FAILURE_TEXT[parsed.reason], { reason: parsed.reason });
          }
          target = { value: parsed.e164, display: parsed.display };
        }
        const devices = store.listDevices();
        let deviceId = typeof body.deviceId === 'string' ? body.deviceId : undefined;
        if (deviceId === undefined) {
          if (devices.length === 0) throw new HttpError(409, 'no_phone_paired', 'Pair a phone first.');
          if (devices.length > 1) throw new HttpError(400, 'device_required', 'Choose which phone to call from.');
          deviceId = devices[0]!.id;
        } else if (!store.getDevice(deviceId)) {
          throw new HttpError(404, 'unknown_device', 'That phone is not paired.');
        }
        return send(res, 201, store.createCall(deviceId, target.value, target.display, raw));
      }

      if (path === '/api/calls' && method === 'GET') return send(res, 200, { calls: store.recent(10) });

      const delDevice = /^\/api\/devices\/([0-9a-f-]{36})$/.exec(path);
      if (delDevice && method === 'DELETE') {
        if (!store.removeDevice(delDevice[1]!)) throw new HttpError(404, 'not_found', 'Unknown phone.');
        return send(res, 200, { ok: true });
      }
    }

    throw new HttpError(404, 'not_found', 'Not found.');
  }

  const server = createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (err instanceof HttpError) {
        send(res, err.status, { error: err.code, message: err.message, ...err.extra }, err.headers);
      } else {
        console.error(err);
        send(res, 500, { error: 'internal', message: 'Internal error.' });
      }
    });
  });
  server.requestTimeout = 60_000;

  return { server, store };
}
