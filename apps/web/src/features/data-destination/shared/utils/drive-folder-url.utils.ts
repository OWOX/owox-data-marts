/**
 * Google Drive FOLDER URL helpers for the destination "auto-create" folder field.
 * Matches folder URLs (with optional /u/N/), e.g.:
 *   https://drive.google.com/drive/folders/<ID>
 *   https://drive.google.com/drive/u/0/folders/<ID>
 * Deliberately does NOT match file/spreadsheet URLs (/file/d/, /spreadsheets/d/).
 */
const driveFolderUrlRegex =
  /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/;

/** True when the string is a valid Google Drive folder URL. */
export function isValidGoogleDriveFolderUrl(url: string): boolean {
  return driveFolderUrlRegex.test(url.trim());
}

/** Extracts the folder ID from a Drive folder URL, or '' when not found. */
export function extractDriveFolderId(url: string): string {
  const match = driveFolderUrlRegex.exec(url.trim());
  return match ? match[1] : '';
}

/** Builds a canonical Drive folder URL from a folder ID (for legacy rows that stored only an ID). */
export function buildDriveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
