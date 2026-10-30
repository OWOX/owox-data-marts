import { createContext } from 'react';

/** Takes the spreadsheet a Source Connect picked for the Credential it saved; a Data Mart configuration's Credential field gives it. */
export const ConnectPickedSpreadsheetContext = createContext<
  ((credentialId: string, spreadsheetId: string) => void) | null
>(null);
