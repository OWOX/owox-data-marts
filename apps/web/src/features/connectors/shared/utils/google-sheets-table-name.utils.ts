const FALLBACK_TABLE_NAME = 'google_sheets';
// Letters that NFKD does not split into a base letter plus a mark. Anything else outside
// a-z0-9 (other scripts included) is dropped, so the result is a best-effort suggestion the
// user can edit, not a faithful transliteration.
const LETTER_REPLACEMENTS: Record<string, string> = {
  ß: 'ss',
  ł: 'l',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
  ŋ: 'n',
  ħ: 'h',
  ŧ: 't',
  ƒ: 'f',
};
const LETTER_REPLACEMENT_PATTERN = new RegExp(
  `[${Object.keys(LETTER_REPLACEMENTS).join('')}]`,
  'g'
);

/**
 * Suggests a target table name for a Google Sheets source from the selected sheet (tab)
 * name, e.g. "Product Engineering" → "product_engineering".
 *
 * The result always satisfies the target-table validation (`^[A-Za-z][A-Za-z0-9_]*$`):
 * diacritics are stripped, a few Latin letters without a decomposition are transliterated,
 * every other run of characters becomes a single underscore, a leading digit gets a
 * `sheet_` prefix, and an empty result falls back to `google_sheets`. It is a suggestion
 * the user sees and can edit, not a reversible encoding: names that differ only in
 * characters outside this set can map to the same identifier.
 */
export function suggestGoogleSheetsTableName(sheetName: unknown): string {
  if (typeof sheetName !== 'string') {
    return FALLBACK_TABLE_NAME;
  }

  const normalized = sheetName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(LETTER_REPLACEMENT_PATTERN, letter => LETTER_REPLACEMENTS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized === '') {
    return FALLBACK_TABLE_NAME;
  }
  return /^[0-9]/.test(normalized) ? `sheet_${normalized}` : normalized;
}
