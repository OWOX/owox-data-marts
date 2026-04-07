import { Logger } from '@nestjs/common';
import { JWT, OAuth2Client } from 'google-auth-library';
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
   * @param credentials - Google Sheets credentials containing service account key. Can be undefined when authClient is provided.
   * @param authClient - Optional pre-configured auth client (OAuth2Client or JWT). If provided, credentials are ignored.
   * @throws Error if neither authClient nor valid credentials are provided
   */
  constructor(credentials: GoogleSheetsCredentials | undefined, authClient: OAuth2Client | JWT);
  constructor(credentials: GoogleSheetsCredentials);
  constructor(credentials: GoogleSheetsCredentials | undefined, authClient?: OAuth2Client | JWT) {
    if (!authClient && !credentials?.serviceAccountKey) {
      throw new Error(
        'Either an auth client or credentials with a service account key must be provided'
      );
    }
    this.service = google.sheets({
      version: 'v4',
      auth: authClient ?? GoogleSheetsApiAdapter.createAuthClient(credentials!.serviceAccountKey!),
    });
  }

  /**
   * Validates Google Sheets credentials
   *
   * @param credentials - Google Sheets credentials to validate
   * @returns True if credentials are valid, false otherwise
   */
  public static async validateCredentials(credentials: GoogleSheetsCredentials): Promise<boolean> {
    if (!credentials.serviceAccountKey) {
      GoogleSheetsApiAdapter.LOGGER.warn(
        'Cannot validate Google Sheets credentials: no service account key provided'
      );
      return false;
    }
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
   * Retrieves developer metadata from a spreadsheet
   *
   * @param spreadsheetId - ID of the spreadsheet
   * @param sheetId - Optional sheet ID to filter metadata
   * @returns Array of developer metadata objects
   */
  public async getDeveloperMetadata(
    spreadsheetId: string,
    sheetId?: number
  ): Promise<sheets_v4.Schema$DeveloperMetadata[]> {
    const metadataFields = 'metadataId,metadataKey,metadataValue,location,visibility';
    const response = await this.executeWithRetry(() =>
      this.service.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
        fields: [
          `developerMetadata(${metadataFields})`,
          `sheets(properties.sheetId,developerMetadata(${metadataFields}))`,
        ].join(','),
      })
    );

    // Merge spreadsheet-level and sheet-level metadata
    const spreadsheetMetadata = response.data.developerMetadata ?? [];
    const sheetMetadata = (response.data.sheets ?? []).flatMap(s => s.developerMetadata ?? []);

    let metadata = [...spreadsheetMetadata, ...sheetMetadata];

    if (sheetId !== undefined) {
      metadata = metadata.filter(m => m.location?.sheetId === sheetId);
    }

    return metadata;
  }

  /**
   * Finds OWOX report metadata by key and sheet
   *
   * @param metadata - Array of developer metadata
   * @returns Found OWOX metadata or undefined
   */
  public findOwoxReportMetadata(
    metadata: sheets_v4.Schema$DeveloperMetadata[]
  ): sheets_v4.Schema$DeveloperMetadata | undefined {
    return metadata.find(m => m.metadataKey === 'OWOX_REPORT_META');
  }

  /**
   * Finds ALL OWOX report metadata entries for a specific sheet
   * Used to detect and clean up duplicate metadata entries
   *
   * @param metadata - Array of developer metadata
   * @param sheetId - Sheet ID to filter by
   * @returns Array of all OWOX metadata entries for the specified sheet
   */
  public findAllOwoxReportMetadataForSheet(
    metadata: sheets_v4.Schema$DeveloperMetadata[],
    sheetId: number
  ): sheets_v4.Schema$DeveloperMetadata[] {
    return metadata.filter(
      m => m.metadataKey === 'OWOX_REPORT_META' && m.location?.sheetId === sheetId
    );
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
   * Builds delete requests for developer metadata without executing them.
   * Use this to combine deletion with other operations in a single batchUpdate call.
   *
   * @param metadataIds - Array of metadata IDs to delete
   */
  public buildDeleteDeveloperMetadataRequests(metadataIds: number[]): sheets_v4.Schema$Request[] {
    return metadataIds.map(metadataId => ({
      deleteDeveloperMetadata: {
        dataFilter: {
          developerMetadataLookup: {
            metadataId,
          },
        },
      },
    }));
  }

  /**
   * Deletes developer metadata from a spreadsheet
   *
   * @param spreadsheetId - ID of the spreadsheet
   * @param metadataIds - Array of metadata IDs to delete
   */
  public async deleteDeveloperMetadata(
    spreadsheetId: string,
    metadataIds: number[]
  ): Promise<void> {
    await this.batchUpdate(spreadsheetId, this.buildDeleteDeveloperMetadataRequests(metadataIds));
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
