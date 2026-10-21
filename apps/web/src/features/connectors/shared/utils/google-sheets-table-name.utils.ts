const FALLBACK_TABLE_NAME = 'google_sheets';
// Letters that NFKD does not split into a base letter plus a mark.
const LETTER_REPLACEMENTS: Record<string, string> = {
  ß: 'ss',
  ł: 'l',
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  đ: 'd',
  þ: 'th',
};

/**
 * Suggests a target table name for a Google Sheets source from the selected sheet (tab)
 * name, e.g. "Product Engineering" → "product_engineering".
 *
 * The result always satisfies the target-table validation (`^[A-Za-z][A-Za-z0-9_]*$`):
 * diacritics are stripped, every other run of characters becomes a single underscore,
 * a leading digit gets a `sheet_` prefix, and an empty result falls back to
 * `google_sheets`.
 */
export function suggestGoogleSheetsTableName(sheetName: unknown): string {
  if (typeof sheetName !== 'string') {
    return FALLBACK_TABLE_NAME;
  }

  const normalized = sheetName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ßłøæœđþ]/g, letter => LETTER_REPLACEMENTS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (normalized === '') {
    return FALLBACK_TABLE_NAME;
  }
  return /^[0-9]/.test(normalized) ? `sheet_${normalized}` : normalized;
}
