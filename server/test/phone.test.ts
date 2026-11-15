import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizePhone, type CountryCode } from '../src/phone.ts';

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
  const inr = normalizePhone('9123456789', 'IN');
  assert.ok(inr.ok && inr.display === '+91 91234 56789');
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
