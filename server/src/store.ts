import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type CallState = 'queued' | 'sent_to_phone' | 'dialing' | 'failed';

export interface Call {
  id: string;
  number: string; // E.164, or the text exactly as typed when raw is true
  display: string;
  raw?: boolean; // "any input" mode: sent as typed, not normalised
  deviceId: string;
  state: CallState;
  reason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Device {
  id: string;
  name: string;
  tokenHash: string; // sha256 hex of the bearer token; the token itself is never stored
  createdAt: number;
  lastSeenAt: number;
}

export interface PairingCode {
  code: string; // display form, e.g. ABCD-EFGH
  expiresAt: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const CODE_LENGTH = 8;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_FAILURES = 5;
const MAX_CALLS_KEPT = 100;
const NO_RESPONSE_MS = 5 * 60 * 1000;
export const ONLINE_WINDOW_MS = 60 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest();

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

interface Persisted {
  devices: Device[];
  calls: Call[];
}

export class Store extends EventEmitter {
  private devices = new Map<string, Device>();
  private calls: Call[] = [];
  private pairing: { raw: string; expiresAt: number; failures: number } | null = null;

  private readonly file: string | null;
  private readonly commandTtlMs: number;
  private readonly now: () => number;

  constructor(file: string | null, commandTtlMs: number, now: () => number = Date.now) {
    super();
    this.file = file;
    this.commandTtlMs = commandTtlMs;
    this.now = now;
    if (file) this.load(file);
  }

  // ---- pairing -----------------------------------------------------------------------------

  createPairingCode(): PairingCode {
    let raw = '';
    for (let i = 0; i < CODE_LENGTH; i++) raw += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    // Only one live code at a time: asking for a new one revokes the previous one.
    this.pairing = { raw, expiresAt: this.now() + CODE_TTL_MS, failures: 0 };
    return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, expiresAt: this.pairing.expiresAt };
  }

  /** Redeems a one-time code. Returns the new device and its token (shown to the phone once). */
  redeemCode(input: string, deviceName: string): { device: Device; token: string } | null {
    const p = this.pairing;
    if (!p || this.now() > p.expiresAt) {
      this.pairing = null;
      return null;
    }
    if (!safeEqual(sha256(normalizeCode(input)), sha256(p.raw))) {
      p.failures += 1;
      if (p.failures >= MAX_CODE_FAILURES) this.pairing = null; // burn the code after repeated misses
      return null;
    }
    this.pairing = null; // single use
    const token = randomBytes(32).toString('base64url');
    const t = this.now();
    const device: Device = {
      id: randomUUID(),
      name: deviceName.trim().slice(0, 40) || 'Phone',
      tokenHash: sha256(token).toString('hex'),
      createdAt: t,
      lastSeenAt: t,
    };
    this.devices.set(device.id, device);
    this.save();
    return { device, token };
  }

  hasActivePairingCode(): boolean {
    return this.pairing !== null && this.now() <= this.pairing.expiresAt;
  }

  // ---- devices -----------------------------------------------------------------------------

  authenticateDevice(token: string): Device | null {
    const hash = sha256(token);
    for (const d of this.devices.values()) {
      if (safeEqual(hash, Buffer.from(d.tokenHash, 'hex'))) {
        d.lastSeenAt = this.now();
        return d;
      }
    }
    return null;
  }

  listDevices(): Device[] {
    return [...this.devices.values()];
  }

  getDevice(id: string): Device | undefined {
    return this.devices.get(id);
  }

  removeDevice(id: string): boolean {
    const existed = this.devices.delete(id);
    if (existed) {
      for (const c of this.calls) {
        if (c.deviceId === id && (c.state === 'queued' || c.state === 'sent_to_phone')) {
          this.setState(c, 'failed', 'phone was unpaired');
        }
      }
      this.save();
    }
    return existed;
  }

  // ---- calls -------------------------------------------------------------------------------

  createCall(deviceId: string, number: string, display: string, raw = false): Call {
    const t = this.now();
    const call: Call = {
      id: randomUUID(),
      number,
      display,
      ...(raw ? { raw: true } : {}),
      deviceId,
      state: 'queued',
      createdAt: t,
      updatedAt: t,
    };
    this.calls.push(call);
    if (this.calls.length > MAX_CALLS_KEPT) this.calls.splice(0, this.calls.length - MAX_CALLS_KEPT);
    this.save();
    this.emit('queued', deviceId);
    return call;
  }

  /** Hands queued calls to the phone and records that they were delivered. */
  takeQueued(deviceId: string): Call[] {
    this.sweep();
    const taken = this.calls.filter((c) => c.deviceId === deviceId && c.state === 'queued');
    for (const c of taken) this.setState(c, 'sent_to_phone');
    if (taken.length) this.save();
    return taken;
  }

  /** Phone-reported progress. Only sent_to_phone can move on, and only to dialing or failed. */
  report(deviceId: string, callId: string, state: 'dialing' | 'failed', reason?: string): Call | 'not_found' | 'conflict' {
    const c = this.calls.find((x) => x.id === callId && x.deviceId === deviceId);
    if (!c) return 'not_found';
    if (c.state !== 'sent_to_phone') return 'conflict';
    this.setState(c, state, state === 'failed' ? (reason?.slice(0, 120) || 'failed on phone') : undefined);
    this.save();
    return c;
  }

  recent(limit = 10): Call[] {
    this.sweep();
    return this.calls.slice(-limit).reverse();
  }

  /** Fails calls that waited too long. Called lazily on reads. */
  sweep(): void {
    const t = this.now();
    let changed = false;
    for (const c of this.calls) {
      if (c.state === 'queued' && t - c.createdAt > this.commandTtlMs) {
        this.setState(c, 'failed', 'phone did not pick it up in time');
        changed = true;
      } else if (c.state === 'sent_to_phone' && t - c.updatedAt > NO_RESPONSE_MS) {
        this.setState(c, 'failed', 'no response from phone');
        changed = true;
      }
    }
    if (changed) this.save();
  }

  private setState(c: Call, state: CallState, reason?: string): void {
    c.state = state;
    c.updatedAt = this.now();
    if (reason) c.reason = reason;
    else delete c.reason;
  }

  // ---- persistence -------------------------------------------------------------------------

  private load(file: string): void {
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<Persisted>;
      for (const d of data.devices ?? []) this.devices.set(d.id, d);
      this.calls = data.calls ?? [];
    } catch {
      // Missing or unreadable file: start empty.
    }
  }

  private save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    const data: Persisted = { devices: [...this.devices.values()], calls: this.calls };
    writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
