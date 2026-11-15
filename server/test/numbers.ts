// Random numbers for tests. No fixed number appears in the test code, so no real person's number
// is ever "used". Each run draws new ones; print the values from a failing assertion to reproduce.
import { randomInt } from 'node:crypto';

const digits = (n: number): string => Array.from({ length: n }, () => String(randomInt(10))).join('');

/** A 10-digit Indian mobile number (first digit 6 to 9). */
export const mobile = (): string => String(randomInt(6, 10)) + digits(9);

export const group = (n: string): string => `${n.slice(0, 5)} ${n.slice(5)}`;

export const N = mobile();
export const M = mobile();
export const E = `+91${N}`;
export const D = `+91 ${group(N)}`;
export const EM = `+91${M}`;
export const randomDigits = digits;
