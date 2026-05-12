/**
 * Sheet-level developer metadata keys used by ODM in Google Sheets exports.
 *
 * These keys are written via `createDeveloperMetadata` requests and read back
 * to determine prior export state and to keep multiple data marts isolated
 * per sheet.
 */
export const GOOGLE_SHEETS_METADATA_KEYS = {
  /**
   * Single entry per sheet, value is JSON `{ reportId, dataMartId, projectId }`.
   * Used to identify which OWOX report owns the imported range on a sheet.
   */
  REPORT_META: 'OWOX_REPORT_META',

  /**
   * JSON array of column names ODM has written into the imported range on the
   * previous refresh. Used to delineate the imported rectangle on subsequent
   * refreshes so that user content right of it stays untouched.
   */
  COLUMNS: 'OWOX_COLUMNS',
} as const;

export type GoogleSheetsMetadataKey =
  (typeof GOOGLE_SHEETS_METADATA_KEYS)[keyof typeof GOOGLE_SHEETS_METADATA_KEYS];
