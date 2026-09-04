/** Google's hard cap for a sheet (tab) name. */
const MAX_SHEET_TITLE_LENGTH = 100;
/** Used when the report title sanitizes down to nothing. */
const DEFAULT_SHEET_TITLE = 'Report data';

/**
 * Google accepts almost any character in a sheet name but caps it at 100 and
 * rejects empty. Apostrophes stay as typed — A1 ranges escape them at
 * construction (`quoteA1SheetTitle` in the adapter), and rewriting them here
 * would make reuse-by-title miss a hand-made sheet whose name contains one.
 * The cap counts code points, not UTF-16 units, so an emoji at the boundary is
 * kept or dropped whole, never bisected.
 */
export function toSheetTitle(raw: string): string {
  const cleaned = Array.from(raw.trim()).slice(0, MAX_SHEET_TITLE_LENGTH).join('').trim();
  return cleaned || DEFAULT_SHEET_TITLE;
}
