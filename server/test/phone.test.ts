import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MAX_DIAL_STRING, normalizePhone, validateDialString, type CountryCode } from '../src/phone.ts';
import { N, group, mobile, randomDigits } from './numbers.ts';

interface Case {
  input: string;
  country: CountryCode;
  e164?: string;
  error?: string;
  note?: string;
}

const cases = JSON.parse(
  readFileSync(new URL('../../shared/phone-cases.json', import.meta.url), 'utf8'),
) as Case[];

test('shared table is big enough to mean something', () => {
  assert.ok(cases.length >= 60);
  assert.ok(cases.filter((c) => c.country === 'IN').length >= 40);
});

for (const c of cases) {
  const label = `${c.country} ${JSON.stringify(c.input)}${c.note ? ` (${c.note})` : ''}`;
  test(label, () => {
    const r = normalizePhone(c.input, c.country);
    if (c.e164 !== undefined) {
      assert.deepEqual(r.ok && r.e164, c.e164);
    } else {
      assert.equal(r.ok, false);
      assert.equal(!r.ok && r.reason, c.error);
    }
  });
}

test('display formatting for Indian and US numbers', () => {
  const inr = normalizePhone(N, 'IN');
  assert.ok(inr.ok && inr.display === `+91 ${group(N)}`);
  const us = normalizePhone('2025550143', 'US');
  assert.ok(us.ok && us.display === '+1 202 555 0143');
});

test('normalising an already-normalised number is a no-op', () => {
  for (const c of cases) {
    if (c.e164 === undefined) continue;
    const again = normalizePhone(c.e164, 'IN');
    assert.ok(again.ok && again.e164 === c.e164, c.e164);
  }
});

test('random Indian numbers in many written forms all normalise to the same E.164 (fresh digits every run)', () => {
  for (let i = 0; i < 300; i++) {
    const n = mobile();
    const e164 = `+91${n}`;
    const forms = [
      n, group(n), `0${n}`, `0 ${group(n)}`, `+91 ${group(n)}`, `+91-${n.slice(0, 5)}-${n.slice(5)}`,
      `91${n}`, `091${n}`, `0091${n}`, `+91 (0) ${group(n)}`, `  ${n}  `,
    ];
    for (const form of forms) {
      const r = normalizePhone(form, 'IN');
      assert.ok(r.ok && r.e164 === e164, `${JSON.stringify(form)} -> ${JSON.stringify(r)}`);
    }
  }
});

test('random numbers with the wrong length are refused with the right reason', () => {
  for (let i = 0; i < 100; i++) {
    const n = mobile();
    const short = normalizePhone(n.slice(0, 9), 'IN');
    const long = normalizePhone(n + randomDigits(1), 'IN');
    assert.ok(!short.ok && short.reason === 'too_short');
    assert.ok(!long.ok && long.reason === 'too_long');
  }
});

test('validateDialString accepts short codes, pauses and extensions exactly as typed', () => {
  for (const text of ['112', '*#06#', '*21*' + mobile() + '#', '1800 123 456,,1', '+91' + mobile() + ';123', 'ABC-DEF']) {
    const r = validateDialString(text);
    assert.ok(r.ok && r.dial === text, text);
  }
  const trimmed = validateDialString('  112  ');
  assert.ok(trimmed.ok && trimmed.dial === '112');
});

test('validateDialString refuses empty, oversized and control or invisible characters', () => {
  assert.deepEqual(validateDialString('   '), { ok: false, reason: 'empty' });
  assert.deepEqual(validateDialString('7'.repeat(MAX_DIAL_STRING + 1)), { ok: false, reason: 'too_long' });
  assert.ok(validateDialString('7'.repeat(MAX_DIAL_STRING)).ok);
  for (const bad of ['1\u00002', '1\n2', '1\t2', '1\u200b2', '1\u202e2', '1\u00a02', '1\u20282']) {
    assert.deepEqual(validateDialString(bad), { ok: false, reason: 'invalid_characters' }, JSON.stringify(bad));
  }
});
