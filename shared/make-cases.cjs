// Generates phone-cases.json (the table both the TypeScript and Kotlin tests read).
// Run: node shared/make-cases.cjs
const fs = require('fs');
const path = require('path');
const c = [];
const ok = (input, country, e164, note = '') => c.push({ input, country, e164, note });
const bad = (input, country, error, note = '') => c.push({ input, country, error, note });

// India (default IN)
ok('9123456789', 'IN', '+919123456789', 'bare 10 digits');
ok('91234 56789', 'IN', '+919123456789', 'space grouping 5-5');
ok('91234-56789', 'IN', '+919123456789', 'dash');
ok('  9123456789  ', 'IN', '+919123456789', 'surrounding whitespace');
ok('09123456789', 'IN', '+919123456789', 'leading trunk 0');
ok('0 91234 56789', 'IN', '+919123456789', 'trunk 0 plus spaces');
ok('+91 91234 56789', 'IN', '+919123456789', 'plus 91 spaces');
ok('+919123456789', 'IN', '+919123456789', 'already e164');
ok('919123456789', 'IN', '+919123456789', '91 prefix, no plus');
ok('91 91234 56789', 'IN', '+919123456789', '91 prefix with spaces');
ok('0919123456789', 'IN', '+919123456789', '0 then 91');
ok('00919123456789', 'IN', '+919123456789', '00 international prefix');
ok('+91-91234-56789', 'IN', '+919123456789', 'plus 91 with dashes');
ok('+91 (0) 91234 56789', 'IN', '+919123456789', 'bracketed trunk zero');
ok('(091) 234-56789', 'IN', '+919123456789', 'mixed brackets and dash');
ok('91.23.45.67.89', 'IN', '+919123456789', 'dots');
ok('9876543210', 'IN', '+919876543210', 'starts with 98');
ok('6000000001', 'IN', '+916000000001', 'starts with 6');
ok('7000000001', 'IN', '+917000000001', 'starts with 7');
ok('8000000001', 'IN', '+918000000001', 'starts with 8');
ok('9100000001', 'IN', '+919100000001', '10 digits starting with 91 is national, not a country code');
ok('011 2345 6789', 'IN', '+911123456789', 'landline with STD code 11');
ok('080-2345-6789', 'IN', '+918023456789', 'landline with STD code 80');
ok('+91 11 2345 6789', 'IN', '+911123456789', 'landline international');
bad('', 'IN', 'empty');
bad('   ', 'IN', 'empty');
bad('912345678', 'IN', 'too_short', '9 digits');
bad('91234567890', 'IN', 'too_long', '11 digits');
bad('0912345678', 'IN', 'too_short', 'trunk plus 9 digits');
bad('00091234567890', 'IN', 'invalid_for_country', '000 prefix leaves a leading zero');
bad('+91 912345678', 'IN', 'too_short', 'plus 91 with 9 digits');
bad('+91 91234567890', 'IN', 'too_long', 'plus 91 with 11 digits');
bad('+91 0123456789', 'IN', 'invalid_for_country', 'national part starts with 0');
bad('0000000000', 'IN', 'invalid_for_country', 'all zero');
bad('91234abc89', 'IN', 'invalid_characters', 'letters');
bad('9123456789x', 'IN', 'invalid_characters', 'trailing letter');
bad('+91 91234 56789 ext 4', 'IN', 'invalid_characters', 'extension text');
bad('91234 56789 #', 'IN', 'invalid_characters', 'hash sign');
bad('++919123456789', 'IN', 'invalid_characters', 'double plus');
bad('91+23456789', 'IN', 'invalid_characters', 'plus in the middle');
bad('+', 'IN', 'invalid_characters', 'lone plus');
bad('-----', 'IN', 'invalid_characters', 'no digits');
bad('(((', 'IN', 'invalid_characters', 'no digits');
bad('३१२३४५६७८९', 'IN', 'invalid_characters', 'Devanagari digits are not accepted');
bad('1' + '2'.repeat(60), 'IN', 'invalid_characters', 'absurdly long');

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
console.log(c.length, 'cases');
