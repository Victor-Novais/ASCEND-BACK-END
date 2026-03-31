import { randomBytes } from 'crypto';

/** Uppercase alphanumeric without ambiguous characters (0/O, 1/I/L). */
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function normalizeCompanyCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function randomCompanyCodeSegment(length = 8): string {
  const buf = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[buf[i]! % CHARSET.length];
  }
  return out;
}
