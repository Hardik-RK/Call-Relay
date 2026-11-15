// Generates phone-cases.json (the table both the TypeScript and Kotlin tests read).
// Run: node shared/make-cases.cjs
const fs = require('fs');
const path = require('path');
const c = [];
const ok = (input, country, e164, note = '') => c.push({ input, country, e164, note });
const bad = (input, country, error, note = '') => c.push({ input, country, error, note });

// Random Indian numbers. Nothing in this table is a fixed number someone might own: every run draws
// fresh digits (print the seed with SEED=<n> to reproduce a table). The structure under test is
// what matters: grouping, prefixes, trunk zeros, lengths.
const seed = Number(process.env.SEED) || (Date.now() & 0x7fffffff);
let state = seed >>> 0;
const rand = () => {
  // mulberry32
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const digits = (n) => Array.from({ length: n }, () => Math.floor(rand() * 10)).join('');
const pick = (list) => list[Math.floor(rand() * list.length)];
// A 10-digit Indian mobile number: first digit 6 to 9.
const mobile = (first = pick(['6', '7', '8', '9'])) => first + digits(9);
const lastDigitDifferent = (n) => n.slice(0, 9) + String((Number(n[9]) + 1 + Math.floor(rand() * 9)) % 10);

const N = mobile();
const E = '+91' + N;
const g = (n) => n.slice(0, 5) + ' ' + n.slice(5);

// India (default IN)
ok(N, 'IN', E, 'bare 10 digits');
ok(g(N), 'IN', E, 'space grouping 5-5');
ok(N.slice(0, 5) + '-' + N.slice(5), 'IN', E, 'dash');
ok('  ' + N + '  ', 'IN', E, 'surrounding whitespace');
ok('0' + N, 'IN', E, 'leading trunk 0');
ok('0 ' + g(N), 'IN', E, 'trunk 0 plus spaces');
ok('+91 ' + g(N), 'IN', E, 'plus 91 spaces');
ok(E, 'IN', E, 'already e164');
ok('91' + N, 'IN', E, '91 prefix, no plus');
ok('91 ' + g(N), 'IN', E, '91 prefix with spaces');
ok('091' + N, 'IN', E, '0 then 91');
ok('0091' + N, 'IN', E, '00 international prefix');
ok('+91-' + N.slice(0, 5) + '-' + N.slice(5), 'IN', E, 'plus 91 with dashes');
ok('+91 (0) ' + g(N), 'IN', E, 'bracketed trunk zero');
ok('(0' + N.slice(0, 2) + ') ' + N.slice(2, 5) + '-' + N.slice(5), 'IN', E, 'mixed brackets and dash');
ok(N.split('').reduce((a, c, i) => a + (i && i % 2 === 0 ? '.' : '') + c, ''), 'IN', E, 'dots');
for (const first of ['6', '7', '8', '9']) {
  const m = mobile(first);
  ok(m, 'IN', '+91' + m, 'starts with ' + first);
}
{
  const m = '91' + digits(8);
  ok(m, 'IN', '+91' + m, '10 digits starting with 91 is national, not a country code');
}
{
  const a = digits(4), b = digits(4);
  ok('011 ' + a + ' ' + b, 'IN', '+9111' + a + b, 'landline with STD code 11');
  ok('080-' + a + '-' + b, 'IN', '+9180' + a + b, 'landline with STD code 80');
  ok('+91 11 ' + a + ' ' + b, 'IN', '+9111' + a + b, 'landline international');
}
bad('', 'IN', 'empty');
bad('   ', 'IN', 'empty');
bad(N.slice(0, 9), 'IN', 'too_short', '9 digits');
bad(N + digits(1), 'IN', 'too_long', '11 digits');
bad('0' + N.slice(0, 9), 'IN', 'too_short', 'trunk plus 9 digits');
bad('000' + N, 'IN', 'invalid_for_country', '000 prefix leaves a leading zero');
bad('+91 ' + N.slice(0, 9), 'IN', 'too_short', 'plus 91 with 9 digits');
bad('+91 ' + N + digits(1), 'IN', 'too_long', 'plus 91 with 11 digits');
bad('+91 0' + digits(9), 'IN', 'invalid_for_country', 'national part starts with 0');
bad('0000000000', 'IN', 'invalid_for_country', 'all zero');
bad(N.slice(0, 5) + 'abc' + N.slice(8), 'IN', 'invalid_characters', 'letters');
bad(N + 'x', 'IN', 'invalid_characters', 'trailing letter');
bad('+91 ' + g(N) + ' ext 4', 'IN', 'invalid_characters', 'extension text');
bad(g(N) + ' #', 'IN', 'invalid_characters', 'hash sign');
bad('++91' + N, 'IN', 'invalid_characters', 'double plus');
bad(N.slice(0, 2) + '+' + N.slice(2), 'IN', 'invalid_characters', 'plus in the middle');
bad('+', 'IN', 'invalid_characters', 'lone plus');
bad('-----', 'IN', 'invalid_characters', 'no digits');
bad('(((', 'IN', 'invalid_characters', 'no digits');
bad(N.split('').map((d) => String.fromCodePoint(0x966 + Number(d))).join(''), 'IN', 'invalid_characters', 'Devanagari digits are not accepted');
bad('1' + '2'.repeat(60), 'IN', 'invalid_characters', 'absurdly long');
// Two more, drawn from the same generator, to catch off-by-ones near the length limits.
bad(lastDigitDifferent(N).slice(0, 8), 'IN', 'too_short', '8 digits');
bad('+91 ' + N + digits(3), 'IN', 'too_long', 'plus 91 with 13 digits');

// Foreign numbers typed with a plus while the default is India
ok('+1 202 555 0143', 'IN', '+12025550143', 'US number, fictional 555-01xx range');
ok('+44 20 7946 0958', 'IN', '+442079460958', 'UK landline, fictional Ofcom range');
ok('+44 (0)20 7946 0958', 'IN', '+442079460958', 'UK with bracketed trunk');
ok('+4915112345678', 'IN', '+4915112345678', 'country not in the table: generic E.164 rules');
bad('+4915', 'IN', 'too_short', 'unknown country, too short');
bad('+1234567890123456', 'IN', 'too_long', '16 digits');
bad('+0 123 456 789', 'IN', 'invalid_for_country', 'country code cannot start with 0');

// United States
ok('2025550143', 'US', '+12025550143');
ok('(202) 555-0143', 'US', '+12025550143');
ok('202.555.0143', 'US', '+12025550143');
ok('1 202 555 0143', 'US', '+12025550143');
ok('+1-202-555-0143', 'US', '+12025550143');
ok('001 202 555 0143', 'US', '+12025550143');
ok('+91 91234 56789', 'US', '+919123456789', 'Indian number typed with plus under US default');
bad('1025550143', 'US', 'invalid_for_country', 'area code starts with 1');
bad('2020550143', 'US', 'invalid_for_country', 'exchange starts with 0');
bad('202555014', 'US', 'too_short', '9 digits');

// United Kingdom
ok('020 7946 0958', 'GB', '+442079460958');
ok('07700 900123', 'GB', '+447700900123');
ok('+44 7700 900123', 'GB', '+447700900123');
ok('447700900123', 'GB', '+447700900123');
bad('0770090012', 'GB', 'too_short');

// Australia
ok('0491 570 156', 'AU', '+61491570156');
ok('491570156', 'AU', '+61491570156');
bad('041234567', 'AU', 'too_short');

fs.writeFileSync(path.join(__dirname, 'phone-cases.json'), JSON.stringify(c, null, 1) + '\n');
console.log(c.length, 'cases, seed', seed);
