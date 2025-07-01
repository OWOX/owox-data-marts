/**
 * Regular expression to match Google Sheets URLs and extract spreadsheetId
 */
const spreadsheetIdRegex =
  /^https:\/\/(docs|spreadsheets)\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

/**
 * Regular expression to match the sheetId (gid parameter) in Google Sheets URLs
 */
const sheetIdRegex = /[#&]gid=([0-9]+)/;

/**
 * Interface for Google Sheets URL components
 */
export interface GoogleSheetsUrlComponents {
  spreadsheetId: string;
  sheetId: number;
}

/**
 * Validates if a given URL is a valid Google Sheets URL
 * @param url - URL to validate
 * @returns true if URL is a valid Google Sheets URL, false otherwise
 */
export function isValidGoogleSheetsUrl(url: string): boolean {
  return spreadsheetIdRegex.test(url);
}

/**
 * Extracts the spreadsheetId from a Google Sheets URL
 * @param url - Google Sheets URL
 * @returns The spreadsheetId or empty string if not found
 */
export function extractSpreadsheetId(url: string): string {
  const match = spreadsheetIdRegex.exec(url);
  return match ? match[2] : '';
}

/**
 * Extracts the sheetId from a Google Sheets URL
 * @param url - Google Sheets URL
 * @returns The sheetId as a string or '0' if not found (0 is the default first sheet)
 */
export function extractSheetId(url: string): string {
  const match = sheetIdRegex.exec(url);
  return match ? match[1] : '0';
}

/**
 * Extracts both spreadsheetId and sheetId from a Google Sheets URL
 * @param url - Google Sheets URL
 * @returns Object containing spreadsheetId and sheetId
 */
export function extractGoogleSheetsUrlComponents(url: string): GoogleSheetsUrlComponents {
  return {
    spreadsheetId: extractSpreadsheetId(url),
    sheetId: parseInt(extractSheetId(url), 10),
  };
}

/**
 * Returns the Google Sheets document URL by spreadsheetId
 * @param spreadsheetId - Google Sheets spreadsheet identifier
 */
export function getGoogleSheetDocumentUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

/**
 * Returns the Google Sheets sheet tab URL by spreadsheetId and sheetId
 * @param spreadsheetId - Google Sheets spreadsheet identifier
 * @param sheetId - Google Sheets sheet identifier (number or string)
 */
export function getGoogleSheetTabUrl(spreadsheetId: string, sheetId: number | string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${String(sheetId)}`;
}

/**
 * Constructs a Google Sheets URL from components
 * @param components - Object containing spreadsheetId and sheetId
 * @returns Complete Google Sheets URL
 */
export function constructGoogleSheetsUrl(components: GoogleSheetsUrlComponents): string {
  return getGoogleSheetTabUrl(components.spreadsheetId, components.sheetId);
}
