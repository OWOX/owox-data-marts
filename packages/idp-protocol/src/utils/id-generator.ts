import { randomBytes } from 'crypto';

/**
 * Generate a UUID v4 string
 * Works across all database types
 */
export function generateId(): string {
  const buf = randomBytes(16);
  buf[6] = (buf[6]! & 0x0f) | 0x40;
  buf[8] = (buf[8]! & 0x3f) | 0x80;

  return buf.toString('hex').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
}
