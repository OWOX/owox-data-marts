/**
 * Result of reconnecting a Google Sheets report to a sheet by title.
 * Mirrors the backend's ReconnectGoogleSheetResponseDto.
 */
export interface ReconnectSheetResponseDto {
  spreadsheetId: string;
  sheetId: number;
  sheetTitle: string;
  /** True when the sheet was created, false when an existing sheet was reused. */
  created: boolean;
  /** False when the report already pointed at a live sheet and nothing was rebound. */
  changed: boolean;
}
