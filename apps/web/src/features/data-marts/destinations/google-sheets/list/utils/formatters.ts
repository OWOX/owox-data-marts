export const formatDate = (date: Date | string | null): string => {
  if (!date) return '—';
  let d: Date;
  if (typeof date === 'string') {
    d = new Date(date);
    if (isNaN(d.getTime())) return '—';
  } else {
    d = date;
    if (isNaN(d.getTime())) return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
};

/**
 * Returns the Google Sheets document URL by spreadsheetId
 * @param spreadsheetId - Google Sheets spreadsheet identifier
 */
export const getGoogleSheetDocumentUrl = (spreadsheetId: string): string =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

/**
 * Returns the Google Sheets sheet tab URL by spreadsheetId and sheetId
 * @param spreadsheetId - Google Sheets spreadsheet identifier
 * @param sheetId - Google Sheets sheet identifier
 */
export const getGoogleSheetTabUrl = (spreadsheetId: string, sheetId: string): string =>
  `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
