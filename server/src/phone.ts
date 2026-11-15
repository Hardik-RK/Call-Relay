// Phone number normalisation to E.164.
// The Kotlin twin lives in android/app/src/main/java/dev/quickdial/PhoneNumbers.kt and both are
// driven by the same table, shared/phone-cases.json. Change one, change both.

export type CountryCode = 'IN' | 'US' | 'GB' | 'AU';

interface CountryRule {
  dial: string;
  /** Length of the national significant number (without trunk prefix). */
  nationalLength: number;
  /** What a valid national number looks like. */
  pattern: RegExp;
  /** Trunk prefix people type when dialling domestically ("0" in India, the UK, Australia). */
  trunk: string | null;
}

const COUNTRIES: Record<CountryCode, CountryRule> = {
  IN: { dial: '91', nationalLength: 10, pattern: /^[1-9]\d{9}$/, trunk: '0' },
  US: { dial: '1', nationalLength: 10, pattern: /^[2-9]\d{2}[2-9]\d{6}$/, trunk: null },
  GB: { dial: '44', nationalLength: 10, pattern: /^[1-9]\d{9}$/, trunk: '0' },
  AU: { dial: '61', nationalLength: 9, pattern: /^[2-9]\d{8}$/, trunk: '0' },
};

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRIES) as CountryCode[];

export function isCountryCode(value: string): value is CountryCode {
  return Object.hasOwn(COUNTRIES, value);
}

export type PhoneFailure =
  | 'empty'
  | 'invalid_characters'
  | 'too_short'
  | 'too_long'
  | 'invalid_for_country';

export type PhoneResult =
  | { ok: true; e164: string; display: string }
  | { ok: false; reason: PhoneFailure };

const ALLOWED = /^\+?[0-9\s\-.()]+$/;
const MIN_DIGITS = 8;
const MAX_DIGITS = 15; // E.164 hard limit

function countryForDigits(intl: string): CountryRule | null {
  for (const rule of Object.values(COUNTRIES)) {
    if (intl.startsWith(rule.dial)) return rule;
  }
  return null;
}

function fail(reason: PhoneFailure): PhoneResult {
  return { ok: false, reason };
}

/** Validate a full international digit string (no plus) and build the result. */
function finish(intl: string): PhoneResult {
  if (intl.length < MIN_DIGITS) return fail('too_short');
  if (intl.startsWith('0')) return fail('invalid_for_country');

  const rule = countryForDigits(intl);
  let digits = intl;
  if (rule) {
    let national = intl.slice(rule.dial.length);
    // "+44 (0)20 ..." style: a trunk zero written after the country code is dropped.
    if (rule.trunk && national.startsWith(rule.trunk) && national.length === rule.nationalLength + 1) {
      national = national.slice(1);
    }
    if (national.length < rule.nationalLength) return fail('too_short');
    if (national.length > rule.nationalLength) return fail('too_long');
    if (!rule.pattern.test(national)) return fail('invalid_for_country');
    digits = rule.dial + national;
  } else if (digits.length > MAX_DIGITS) {
    return fail('too_long');
  }
  return { ok: true, e164: `+${digits}`, display: formatDisplay(digits, rule) };
}

function formatDisplay(digits: string, rule: CountryRule | null): string {
  if (!rule) return `+${digits}`;
  const national = digits.slice(rule.dial.length);
  if (rule.dial === '91') return `+91 ${national.slice(0, 5)} ${national.slice(5)}`;
  if (rule.dial === '1') return `+1 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
  return `+${rule.dial} ${national}`;
}

export type DialStringFailure = 'empty' | 'too_long' | 'invalid_characters';

export type DialStringResult =
  | { ok: true; dial: string; display: string }
  | { ok: false; reason: DialStringFailure };

export const MAX_DIAL_STRING = 32;

/**
 * "Any input" mode: the text is sent to the phone exactly as typed (short codes, extensions,
 * *#-style codes, pauses). Only what could not possibly be dialled is refused: nothing, too much
 * text, and control or invisible characters. The phone still asks you to confirm before dialling.
 */
export function validateDialString(input: string): DialStringResult {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if ([...text].length > MAX_DIAL_STRING) return { ok: false, reason: 'too_long' };
  if (/[\p{C}\p{Z}]/u.test(text.replace(/ /g, ''))) return { ok: false, reason: 'invalid_characters' };
  return { ok: true, dial: text, display: text };
}

export function normalizePhone(input: string, defaultCountry: CountryCode): PhoneResult {
  const text = input.trim();
  if (text === '') return fail('empty');
  if (text.length > 40 || !ALLOWED.test(text)) return fail('invalid_characters');
  // ALLOWED lets a plus appear only as the very first character.
  const digits = text.replace(/\D/g, '');
  if (digits === '') return fail('invalid_characters');

  if (text.startsWith('+')) return finish(digits);
  if (digits.startsWith('00')) return finish(digits.slice(2));

  const rule = COUNTRIES[defaultCountry];
  const withCountry = rule.dial.length + rule.nationalLength;

  // Already carries the country code, just without a plus: 919123456789
  if (digits.startsWith(rule.dial) && digits.length === withCountry) return finish(digits);
  // Trunk zero in front of a country-coded number: 0919123456789
  if (rule.trunk && digits.startsWith(rule.trunk + rule.dial) && digits.length === withCountry + 1) {
    return finish(digits.slice(1));
  }

  let national = digits;
  if (rule.trunk && national.startsWith(rule.trunk)) national = national.slice(1);
  if (national.length < rule.nationalLength) return fail('too_short');
  if (national.length > rule.nationalLength) return fail('too_long');
  return finish(rule.dial + national);
}
