/**
 * Regex matching characters outside the Basic Multilingual Plane (U+10000–U+10FFFF).
 * These are 4-byte UTF-8 sequences (emoji, musical symbols, etc.) that legacy
 * MySQL `utf8` (non-utf8mb4) columns silently truncate.
 */
const NON_BMP_REGEX = /[\u{10000}-\u{10FFFF}]/u;

export const LEGACY_TITLE_ERROR =
  'Title cannot contain emoji or special symbols. Legacy BigQuery storage does not support these characters.';

export function containsNonBmpCharacters(value: string): boolean {
  return NON_BMP_REGEX.test(value);
}
