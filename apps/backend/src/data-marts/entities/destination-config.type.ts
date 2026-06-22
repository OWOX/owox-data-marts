/**
 * Destination-level configuration stored on the `data_destination.config` JSON
 * column. Optional and type-specific. Distinct from a Report's `destinationConfig`
 * (which holds per-report spreadsheet/sheet ids).
 */
export interface DestinationConfig {
  /**
   * Google Drive folder ID where auto-created Google Sheets are placed.
   * Used by the "Create GS" / auto-creation flow (Google Sheets destinations).
   */
  folderId?: string | null;
}
