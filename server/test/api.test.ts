import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp, type App } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';

interface Harness {
  app: App;
  base: string;
  close: () => Promise<void>;
}

async function start(env: Record<string, string> = {}): Promise<Harness> {
  const config = loadConfig({ DATA_FILE: '', ...env });
  const app = createApp(config);
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return {
    app,
    base,
    close: () =>
      new Promise<void>((r) => {
        app.server.closeAllConnections();
        app.server.close(() => r());
      }),
  };
}

const json = { 'content-type': 'application/json' };
const post = (h: Harness, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(h.base + path, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify(body) });

async function pairPhone(h: Harness, name = 'Test phone', webHeaders: Record<string, string> = {}) {
  const code = (await (await post(h, '/api/pairing-code', {}, webHeaders)).json()) as { code: string };
  const res = await post(h, '/api/pair', { code: code.code, deviceName: name });
  assert.equal(res.status, 201);
  const body = (await res.json()) as { deviceId: string; token: string };
  return { ...body, auth: { authorization: `Bearer ${body.token}` } };
}

function rawGet(url: string, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('pairing and calling, end to end', () => {
  let h: Harness;
  before(async () => (h = await start()));
  after(() => h.close());

  test('health and the page are served with a restrictive CSP', async () => {
    assert.equal((await fetch(h.base + '/api/health')).status, 200);
    const page = await fetch(h.base + '/');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
  });

  test('calling before any phone is paired is a clear 409', async () => {
    const res = await post(h, '/api/calls', { number: '9123456789' });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: string }).error, 'no_phone_paired');
  });

  test('pair, queue a call, phone receives it and reports dialing', async () => {
    const phone = await pairPhone(h);

    const created = await post(h, '/api/calls', { number: '091234-56789' });
    assert.equal(created.status, 201);
    const call = (await created.json()) as { id: string; number: string; display: string; state: string };
    assert.equal(call.number, '+919123456789');
    assert.equal(call.display, '+91 91234 56789');
    assert.equal(call.state, 'queued');

    const polled = await fetch(h.base + '/api/device/commands', { headers: phone.auth });
    const cmds = ((await polled.json()) as { commands: { id: string; type: string; number: string }[] }).commands;
    assert.deepEqual(
      cmds.map((c) => [c.id, c.type, c.number]),
      [[call.id, 'dial', '+919123456789']],
    );

    let state = (await (await fetch(h.base + '/api/state')).json()) as { calls: { state: string }[] };
    assert.equal(state.calls[0]!.state, 'sent_to_phone');

    const rep = await post(h, `/api/device/calls/${call.id}/status`, { state: 'dialing' }, phone.auth);
    assert.equal(rep.status, 200);
    state = (await (await fetch(h.base + '/api/state')).json()) as { calls: { state: string }[] };
    assert.equal(state.calls[0]!.state, 'dialing');

    const again = await post(h, `/api/device/calls/${call.id}/status`, { state: 'dialing' }, phone.auth);
    assert.equal(again.status, 409);
  });

  test('long poll wakes up as soon as a call is queued', async () => {
    const phone = await pairPhone(h, 'Second phone');
    const started = Date.now();
    const pending = fetch(h.base + '/api/device/commands?wait=20', { headers: phone.auth });
    await new Promise((r) => setTimeout(r, 150));
    // two phones are paired now, so the target must be named
    const res = await post(h, '/api/calls', { number: '+91 98765 43210', deviceId: phone.deviceId });
    assert.equal(res.status, 201);
    const body = (await (await pending).json()) as { commands: { number: string }[] };
    assert.equal(body.commands[0]!.number, '+919876543210');
    assert.ok(Date.now() - started < 5000, 'returned well before the 20 s wait');
  });

  test('two phones without deviceId is a 400, unknown device is a 404', async () => {
    assert.equal((await post(h, '/api/calls', { number: '9123456789' })).status, 400);
    const unknown = await post(h, '/api/calls', {
      number: '9123456789',
      deviceId: '00000000-0000-0000-0000-000000000000',
    });
    assert.equal(unknown.status, 404);
  });

  test('invalid numbers are rejected with a reason', async () => {
    const res = await post(h, '/api/calls', { number: '12345' });
    assert.equal(res.status, 422);
    const body = (await res.json()) as { error: string; reason: string };
    assert.equal(body.error, 'invalid_number');
    assert.equal(body.reason, 'too_short');
    assert.equal((await post(h, '/api/calls', {})).status, 422);
    assert.equal((await post(h, '/api/calls', { number: 12345 })).status, 422);
  });

  test('normalize endpoint previews', async () => {
    const ok = (await (await fetch(h.base + '/api/normalize?number=09123456789')).json()) as {
      ok: boolean;
      e164: string;
    };
    assert.deepEqual([ok.ok, ok.e164], [true, '+919123456789']);
    const bad = (await (await fetch(h.base + '/api/normalize?number=abc')).json()) as {
      ok: boolean;
      reason: string;
    };
    assert.deepEqual([bad.ok, bad.reason], [false, 'invalid_characters']);
  });

  test('phone can report failure and unpair itself', async () => {
    const phone = await pairPhone(h, 'Third phone');
    const call = (await (
      await post(h, '/api/calls', { number: '9123456789', deviceId: phone.deviceId })
    ).json()) as { id: string };
    await fetch(h.base + '/api/device/commands', { headers: phone.auth });
    await post(h, `/api/device/calls/${call.id}/status`, { state: 'failed', reason: 'declined on phone' }, phone.auth);
    const state = (await (await fetch(h.base + '/api/state')).json()) as {
      calls: { id: string; state: string; reason: string }[];
    };
    const mine = state.calls.find((c) => c.id === call.id)!;
    assert.deepEqual([mine.state, mine.reason], ['failed', 'declined on phone']);

    const del = await fetch(h.base + '/api/device', { method: 'DELETE', headers: phone.auth });
    assert.equal(del.status, 200);
    assert.equal((await fetch(h.base + '/api/device/commands', { headers: phone.auth })).status, 401);
  });

  test('web can remove a phone', async () => {
    const phone = await pairPhone(h, 'Removable');
    const del = await fetch(`${h.base}/api/devices/${phone.deviceId}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    assert.equal((await fetch(`${h.base}/api/devices/${phone.deviceId}`, { method: 'DELETE' })).status, 404);
  });
});

describe('device authentication', () => {
  let h: Harness;
  before(async () => (h = await start()));
  after(() => h.close());

  test('no token, wrong token and wrong scheme are all 401', async () => {
    assert.equal((await fetch(h.base + '/api/device/commands')).status, 401);
    const bad = { authorization: 'Bearer nope' };
    assert.equal((await fetch(h.base + '/api/device/commands', { headers: bad })).status, 401);
    const basic = { authorization: 'Basic abc' };
    assert.equal((await fetch(h.base + '/api/device/commands', { headers: basic })).status, 401);
  });

  test('a device cannot report on another device call', async () => {
    const a = await pairPhone(h, 'A');
    const b = await pairPhone(h, 'B');
    const call = (await (
      await post(h, '/api/calls', { number: '9123456789', deviceId: a.deviceId })
    ).json()) as { id: string };
    await fetch(h.base + '/api/device/commands', { headers: a.auth });
    const res = await post(h, `/api/device/calls/${call.id}/status`, { state: 'dialing' }, b.auth);
    assert.equal(res.status, 404);
    const poll = (await (await fetch(h.base + '/api/device/commands', { headers: b.auth })).json()) as {
      commands: unknown[];
    };
    assert.equal(poll.commands.length, 0);
  });

  test('bad status payloads are 400', async () => {
    const a = await pairPhone(h, 'C');
    const res = await post(h, '/api/device/calls/00000000-0000-0000-0000-000000000000/status', { state: 'queued' }, a.auth);
    assert.equal(res.status, 400);
  });

  test('repeated bad tokens lock the address out', async () => {
    const h2 = await start();
    try {
      const phone = await pairPhone(h2);
      for (let i = 0; i < 10; i++) {
        await fetch(h2.base + '/api/device/commands', { headers: { authorization: 'Bearer wrong' } });
      }
      const res = await fetch(h2.base + '/api/device/commands', { headers: phone.auth });
      assert.equal(res.status, 429);
    } finally {
      await h2.close();
    }
  });
});

describe('pairing safety', () => {
  let h: Harness;
  before(async () => (h = await start()));
  after(() => h.close());

  test('wrong code is 403, no code issued is 403', async () => {
    assert.equal((await post(h, '/api/pair', { code: 'AAAA-AAAA' })).status, 403);
    await post(h, '/api/pairing-code', {});
    assert.equal((await post(h, '/api/pair', { code: 'AAAA-AAAA' })).status, 403);
    assert.equal((await post(h, '/api/pair', {})).status, 403);
  });

  test('pairing attempts are rate limited per address (5 per minute)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await post(h, '/api/pair', { code: 'AAAA-AAAA' })).status);
    assert.ok(statuses.includes(429), statuses.join(','));
  });
});

describe('rate limits on calls', () => {
  let h: Harness;
  before(async () => (h = await start()));
  after(() => h.close());

  test('the 11th call in a minute is 429 with Retry-After', async () => {
    await pairPhone(h);
    const statuses: number[] = [];
    let retry: string | null = null;
    for (let i = 0; i < 12; i++) {
      const r = await post(h, '/api/calls', { number: '9123456789' });
      statuses.push(r.status);
      if (r.status === 429) retry = r.headers.get('retry-after');
    }
    assert.equal(statuses.filter((s) => s === 201).length, 10);
    assert.equal(statuses.at(-1), 429);
    assert.ok(Number(retry) >= 1);
  });
});

describe('browser-facing guards', () => {
  let h: Harness;
  before(async () => (h = await start()));
  after(() => h.close());

  test('cross-origin requests are refused even though no CORS headers are sent', async () => {
    const res = await post(h, '/api/calls', { number: '9123456789' }, { origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    const get = await fetch(h.base + '/api/state', { headers: { origin: 'https://evil.example' } });
    assert.equal(get.status, 403);
  });

  test('same-origin Origin header is accepted', async () => {
    const res = await fetch(h.base + '/api/state', { headers: { origin: h.base } });
    assert.equal(res.status, 200);
  });

  test('non-JSON content types are refused (blocks simple cross-site form posts)', async () => {
    const res = await fetch(h.base + '/api/pairing-code', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    });
    assert.equal(res.status, 415);
  });

  test('malformed and oversized bodies', async () => {
    const bad = await fetch(h.base + '/api/calls', { method: 'POST', headers: json, body: '{nope' });
    assert.equal(bad.status, 400);
    const arr = await fetch(h.base + '/api/calls', { method: 'POST', headers: json, body: '[]' });
    assert.equal(arr.status, 400);
    const big = await fetch(h.base + '/api/calls', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ number: 'x'.repeat(9000) }),
    });
    assert.equal(big.status, 413);
  });

  test('unexpected Host header is refused (DNS rebinding)', async () => {
    assert.equal(await rawGet(h.base + '/api/state', { host: 'rebind.example' }), 421);
  });

  test('unknown routes are 404', async () => {
    assert.equal((await fetch(h.base + '/api/nothing')).status, 404);
    assert.equal((await fetch(h.base + '/nothing')).status, 404);
  });
});

describe('access key mode', () => {
  const KEY = 'correct-horse-battery';
  let h: Harness;
  before(async () => (h = await start({ ACCESS_KEY: KEY })));
  after(() => h.close());

  test('web API needs the key', async () => {
    assert.equal((await fetch(h.base + '/api/state')).status, 401);
    const wrong = { 'x-access-key': 'wrong-wrong-wrong' };
    assert.equal((await fetch(h.base + '/api/state', { headers: wrong })).status, 401);
    assert.equal((await fetch(h.base + '/api/state', { headers: { 'x-access-key': KEY } })).status, 200);
    assert.equal((await fetch(h.base + '/api/health')).status, 200);
  });

  test('pairing works with the key and the phone then needs only its token', async () => {
    const phone = await pairPhone(h, 'P', { 'x-access-key': KEY });
    const poll = await fetch(h.base + '/api/device/commands', { headers: phone.auth });
    assert.equal(poll.status, 200);
  });

  test('repeated wrong keys lock the address out, even for the right key', async () => {
    const h2 = await start({ ACCESS_KEY: KEY });
    try {
      for (let i = 0; i < 10; i++) {
        await fetch(h2.base + '/api/state', { headers: { 'x-access-key': 'wrong-wrong-wrong' } });
      }
      const locked = await fetch(h2.base + '/api/state', { headers: { 'x-access-key': KEY } });
      assert.equal(locked.status, 429);
    } finally {
      await h2.close();
    }
  });
});

describe('allowed hosts', () => {
  test('a configured private name is accepted, others are not', async () => {
    const h = await start({ ALLOWED_HOSTS: 'dial.tailnet.example' });
    try {
      assert.equal(await rawGet(h.base + '/api/health', { host: 'dial.tailnet.example:8787' }), 200);
      assert.equal(await rawGet(h.base + '/api/health', { host: 'other.example:8787' }), 421);
    } finally {
      await h.close();
    }
  });
});
