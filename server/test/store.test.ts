import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Store, normalizeCode } from '../src/store.ts';
import { D, E, N } from './numbers.ts';

function fixture() {
  let t = 1_000_000;
  const clock = { advance: (ms: number) => (t += ms) };
  const store = new Store(null, 120_000, () => t);
  return { store, clock };
}

function pair(store: Store) {
  const code = store.createPairingCode().code;
  const r = store.redeemCode(code, 'Test phone');
  assert.ok(r);
  return r;
}

test('pairing code is 8 unambiguous characters, shown as XXXX-XXXX', () => {
  const { store } = fixture();
  const { code } = store.createPairingCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
});

test('code is single use and the token is not stored in clear', () => {
  const { store } = fixture();
  const code = store.createPairingCode().code;
  const r = store.redeemCode(code.toLowerCase().replace('-', ' '), 'Phone');
  assert.ok(r);
  assert.equal(store.redeemCode(code, 'Again'), null);
  assert.notEqual(r.device.tokenHash, r.token);
  assert.equal(store.authenticateDevice(r.token)?.id, r.device.id);
  assert.equal(store.authenticateDevice(r.token + 'x'), null);
});

test('code expires after ten minutes', () => {
  const { store, clock } = fixture();
  const code = store.createPairingCode().code;
  clock.advance(10 * 60 * 1000 + 1);
  assert.equal(store.redeemCode(code, 'Late'), null);
});

test('five wrong guesses burn the code even if the right one follows', () => {
  const { store } = fixture();
  const code = store.createPairingCode().code;
  for (let i = 0; i < 5; i++) assert.equal(store.redeemCode('AAAA-AAAA', 'x'), null);
  assert.equal(store.redeemCode(code, 'Phone'), null);
});

test('a new code revokes the previous one', () => {
  const { store } = fixture();
  const first = store.createPairingCode().code;
  store.createPairingCode();
  assert.equal(store.redeemCode(first, 'Phone'), null);
});

test('normalizeCode strips noise', () => {
  assert.equal(normalizeCode(' ab-cd 12 '), 'ABCD12');
});

test('call lifecycle: queued, sent_to_phone, dialing', () => {
  const { store } = fixture();
  const { device } = pair(store);
  const call = store.createCall(device.id, E, D);
  assert.equal(call.state, 'queued');
  const taken = store.takeQueued(device.id);
  assert.equal(taken.length, 1);
  assert.equal(taken[0]!.state, 'sent_to_phone');
  assert.equal(store.takeQueued(device.id).length, 0, 'delivered once only');
  const r = store.report(device.id, call.id, 'dialing');
  assert.notEqual(r, 'conflict');
  assert.equal(store.recent()[0]!.state, 'dialing');
});

test('report rules: wrong device, unknown call, repeat report', () => {
  const { store } = fixture();
  const a = pair(store).device;
  const b = pair(store).device;
  const call = store.createCall(a.id, E, 'x');
  store.takeQueued(a.id);
  assert.equal(store.report(b.id, call.id, 'dialing'), 'not_found');
  assert.equal(store.report(a.id, 'nope', 'dialing'), 'not_found');
  assert.notEqual(store.report(a.id, call.id, 'failed', 'declined'), 'conflict');
  assert.equal(store.report(a.id, call.id, 'dialing'), 'conflict');
  assert.equal(store.recent()[0]!.reason, 'declined');
});

test('queued call fails when the phone never polls', () => {
  const { store, clock } = fixture();
  const { device } = pair(store);
  store.createCall(device.id, E, 'x');
  clock.advance(121_000);
  const c = store.recent()[0]!;
  assert.equal(c.state, 'failed');
  assert.match(c.reason ?? '', /did not pick it up/);
  assert.equal(store.takeQueued(device.id).length, 0);
});

test('delivered call with no report fails after five minutes', () => {
  const { store, clock } = fixture();
  const { device } = pair(store);
  store.createCall(device.id, E, 'x');
  store.takeQueued(device.id);
  clock.advance(5 * 60 * 1000 + 1);
  assert.equal(store.recent()[0]!.state, 'failed');
});

test('removing a device fails its open calls', () => {
  const { store } = fixture();
  const { device } = pair(store);
  store.createCall(device.id, E, 'x');
  assert.ok(store.removeDevice(device.id));
  assert.equal(store.recent()[0]!.state, 'failed');
  assert.equal(store.removeDevice(device.id), false);
});

test('recent returns newest first and is capped', () => {
  const { store } = fixture();
  const { device } = pair(store);
  for (let i = 0; i < 12; i++) store.createCall(device.id, `+91${N.slice(0, 8)}${String(i).padStart(2, '0')}`, String(i));
  const r = store.recent(10);
  assert.equal(r.length, 10);
  assert.equal(r[0]!.display, '11');
});

test('persistence round trip keeps devices (token hash only) and calls', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-'));
  try {
    const file = join(dir, 'state.json');
    const s1 = new Store(file, 120_000);
    const code = s1.createPairingCode().code;
    const r = s1.redeemCode(code, 'Phone')!;
    s1.createCall(r.device.id, E, 'x');
    assert.ok(!readFileSync(file, 'utf8').includes(r.token), 'raw token must not be on disk');
    const s2 = new Store(file, 120_000);
    assert.equal(s2.authenticateDevice(r.token)?.id, r.device.id);
    assert.equal(s2.recent().length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing state file starts empty instead of crashing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qd-'));
  try {
    const s = new Store(join(dir, 'missing.json'), 120_000);
    assert.equal(s.listDevices().length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('device names are cleaned for display: no control or bidi characters, whole code points, 40 max', () => {
  const { store } = fixture();
  const name = (raw: string) => {
    const r = store.redeemCode(store.createPairingCode().code, raw);
    assert.ok(r);
    return r.device.name;
  };
  assert.equal(name('‮evil‬ phone'), 'evil phone');
  assert.equal(name('a\tb\nc\u0000d'), 'abcd');
  assert.equal(name('   '), 'Phone');
  assert.equal(name('​'), 'Phone');
  assert.equal(name('W'.repeat(100)).length, 40);
  const emoji = name('x' + '\u{1F600}'.repeat(60));
  assert.equal([...emoji].length, 40);
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(emoji), 'no split surrogate pair');
});

test('pairingExpiresAt follows the one live code: replaced, burned, redeemed and expired codes clear it', () => {
  const { store, clock } = fixture();
  assert.equal(store.pairingExpiresAt(), null);
  const first = store.createPairingCode();
  assert.equal(store.pairingExpiresAt(), first.expiresAt);
  const second = store.createPairingCode();
  assert.equal(store.pairingExpiresAt(), second.expiresAt);
  for (let i = 0; i < 5; i++) store.redeemCode('AAAA-AAAA', 'x');
  assert.equal(store.pairingExpiresAt(), null);
  const third = store.createPairingCode();
  assert.ok(store.redeemCode(third.code, 'Phone'));
  assert.equal(store.pairingExpiresAt(), null);
  store.createPairingCode();
  clock.advance(10 * 60 * 1000 + 1);
  assert.equal(store.pairingExpiresAt(), null);
});
