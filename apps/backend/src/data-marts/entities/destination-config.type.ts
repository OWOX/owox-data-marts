/**
 * Destination-level configuration stored on the `data_destination.config` JSON
 * column. Optional and type-specific. Distinct from a Report's `destinationConfig`
 * (which holds per-report spreadsheet/sheet ids).
 */
export interface DestinationConfig {
  /**
   * Raw Google Drive folder URL the user pasted (source of truth, kept so the UI
   * can render a clickable open-in-Drive link). The `folderId` is derived from it.
   */
  folderUrl?: string | null;

  /**
   * Google Drive folder ID where auto-created Google Sheets are placed. Derived
   * from `folderUrl` at the write boundary; consumed by the validator and the
   * auto-creation flow (Google Sheets destinations).
   */
  folderId?: string | null;
}
