const FALLBACK_TABLE_NAME = 'google_sheets';
const MAX_TABLE_NAME_LENGTH = 100;
// Ukrainian national transliteration (KMU 2010, non-initial forms) plus Russian ё ы э ъ.
const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
  ё: 'e',
  ы: 'y',
  э: 'e',
  ъ: '',
  ʼ: '',
  '’': '',
  "'": '',
};

// Latin letters that NFKD does not split into a base letter plus a mark.
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

function toIdentifierPart(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[\u0400-\u04ff\u02bc\u2019']/g, letter => CYRILLIC_TO_LATIN[letter] ?? letter)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(LETTER_REPLACEMENT_PATTERN, letter => LETTER_REPLACEMENTS[letter] ?? letter)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const withDigitPrefix = (name: string) => (/^[0-9]/.test(name) ? `sheet_${name}` : name);
const cut = (name: string, length: number) => name.slice(0, Math.max(0, length)).replace(/_+$/, '');

/**
 * Suggests a target table name for a Google Sheets source as `<document>_<sheet>`, e.g.
 * ("Plan", "Product Engineering") → "product_engineering_plan".
 *
 * The result always satisfies the target-table validation (`^[A-Za-z][A-Za-z0-9_]*$`):
 * Ukrainian and Russian Cyrillic is transliterated, diacritics are stripped, a few Latin
 * letters without a decomposition are transliterated, every other run of characters becomes
 * a single underscore, a leading digit gets a `sheet_` prefix, and an empty result falls back
 * to `google_sheets`. The name is capped at 100 characters (Redshift allows 127), cutting the
 * document part first. It is a suggestion the user can edit, not a reversible encoding.
 */
export function suggestGoogleSheetsTableName(sheetName: unknown, documentName?: unknown): string {
  const sheet = toIdentifierPart(sheetName);
  const document = toIdentifierPart(documentName);
  if (!document || !sheet) {
    const only = document || sheet;
    return only ? cut(withDigitPrefix(only), MAX_TABLE_NAME_LENGTH) : FALLBACK_TABLE_NAME;
  }
  // The document part is cut first so the sheet part survives.
  const prefix = /^[0-9]/.test(document) ? 'sheet_'.length : 0;
  const kept = cut(document, MAX_TABLE_NAME_LENGTH - prefix - sheet.length - 1);
  return kept
    ? withDigitPrefix(`${kept}_${sheet}`)
    : cut(withDigitPrefix(sheet), MAX_TABLE_NAME_LENGTH);
}
