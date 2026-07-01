/**
 * Checks whether a string contains characters outside the Basic Multilingual Plane (BMP),
 * i.e. Unicode code points above U+FFFF. These are encoded as 4-byte sequences in UTF-8
 * and include emoji, some CJK ideographs, musical symbols, etc.
 *
 * Legacy systems using MySQL `utf8` (3-byte max) charset silently truncate strings
 * at the first 4-byte character, which can cause data loss.
 */
const NON_BMP_REGEX = /[\u{10000}-\u{10FFFF}]/u;

export function containsNonBmpCharacters(value: string): boolean {
  return NON_BMP_REGEX.test(value);
}
