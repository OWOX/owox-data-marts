import { Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { google, sheets_v4 } from 'googleapis';
import { GoogleServiceAccountKey } from '../../../../common/schemas/google-service-account-key.schema';
import { GoogleSheetsCredentials } from '../schemas/google-sheets-credentials.schema';

/**
 * Adapter for Google Sheets API operations
 */
export class GoogleSheetsApiAdapter {
  private static readonly SHEETS_SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];
  private static readonly LOGGER = new Logger(GoogleSheetsApiAdapter.name);

  private readonly service: sheets_v4.Sheets;

  /**
   * @param credentials - Google Sheets credentials containing service account key
   * @throws Error if invalid credentials are provided
   */
  constructor(credentials: GoogleSheetsCredentials) {
    this.service = google.sheets({
      version: 'v4',
      auth: GoogleSheetsApiAdapter.createAuthClient(credentials.serviceAccountKey),
    });
  }

  /**
   * Validates Google Sheets credentials
   *
   * @param credentials - Google Sheets credentials to validate
   * @returns True if credentials are valid, false otherwise
   */
  public static async validateCredentials(credentials: GoogleSheetsCredentials): Promise<boolean> {
    try {
      const authClient = GoogleSheetsApiAdapter.createAuthClient(credentials.serviceAccountKey);
      await authClient.getAccessToken();
      return true;
    } catch (error) {
      GoogleSheetsApiAdapter.LOGGER.warn('Failed to validate Google Sheets credentials', error);
      return false;
    }
  }

  /**
   * Retrieves spreadsheet metadata
   *
   * @param spreadsheetId - ID of the spreadsheet to retrieve
   * @param fields - Optional fields to include in the response
   */
  public async getSpreadsheet(
    spreadsheetId: string,
    fields: string = 'properties,sheets.properties'
  ): Promise<sheets_v4.Schema$Spreadsheet> {
    const resp = await this.executeWithRetry(() =>
      this.service.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
        fields,
      })
    );
    return resp.data;
  }

  /**
   * Finds a sheet by its ID within a spreadsheet
   */
  public findSheetById(
    spreadsheet: sheets_v4.Schema$Spreadsheet,
    sheetId: number
  ): sheets_v4.Schema$Sheet | undefined {
    return spreadsheet.sheets?.find(s => s?.properties?.sheetId === sheetId);
  }

  /**
   * Clears all content from a sheet
   */
  public async clearSheet(spreadsheetId: string, sheetTitle: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.service.spreadsheets.values.clear({
        spreadsheetId,
        range: `'${sheetTitle}'`,
      })
    );
  }

  /**
   * Updates values in a sheet
   */
  public async updateValues(
    spreadsheetId: string,
    range: string,
    values: unknown[][]
  ): Promise<void> {
    await this.executeWithRetry(() =>
      this.service.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values,
        },
      })
    );
  }

  /**
   * Appends rows or columns to a sheet in a Google Spreadsheet.
   */
  public async appendDimensionToSheet(
    spreadsheetId: string,
    sheetId: number,
    size: number,
    dimension: 'ROWS' | 'COLUMNS'
  ): Promise<void> {
    const requests: sheets_v4.Schema$Request[] = [
      {
        appendDimension: {
          dimension: dimension,
          sheetId: sheetId,
          length: size,
        },
      },
    ];
    await this.batchUpdate(spreadsheetId, requests);
  }

  /**
   * Performs a batch update operation on a spreadsheet
   */
  public async batchUpdate(
    spreadsheetId: string,
    requests: sheets_v4.Schema$Request[]
  ): Promise<void> {
    await this.executeWithRetry(() =>
      this.service.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      })
    );
  }

  /**
   * Creates a JWT AuthClient for Google Sheets
   */
  private static createAuthClient(serviceAccountKey: GoogleServiceAccountKey): JWT {
    return new JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: GoogleSheetsApiAdapter.SHEETS_SCOPE,
    });
  }

  /**
   * Executes an API call with exponential backoff retry for quota-exceeded errors
   */
  private async executeWithRetry<T>(apiCallFn: () => Promise<T>): Promise<T> {
    const maxRetries = 5;
    const maxDelayMs = 30000; // 30 seconds
    const baseDelayMs = 1000; // 1 second

    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        return await apiCallFn();
      } catch (error) {
        if (!error.message.includes('Quota exceeded')) {
          throw error;
        }

        const delayMs = Math.min(Math.pow(2, retryCount) * baseDelayMs, maxDelayMs);
        GoogleSheetsApiAdapter.LOGGER.warn(
          `Google API quota exceeded. Retrying in ${delayMs / 1000} seconds. ` +
            `Retry ${retryCount + 1}/${maxRetries}`
        );

        await new Promise(resolve => setTimeout(resolve, delayMs));
        retryCount++;
      }
    }

    throw new Error('Maximum retry attempts exceeded');
  }
}
