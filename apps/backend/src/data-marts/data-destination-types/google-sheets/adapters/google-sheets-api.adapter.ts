import { Logger } from '@nestjs/common';
import { JWT, OAuth2Client } from 'google-auth-library';
import { google, sheets_v4 } from 'googleapis';
import { GoogleServiceAccountKey } from '../../../../common/schemas/google-service-account-key.schema';
import { GOOGLE_SHEETS_METADATA_KEYS } from '../constants/google-sheets-metadata-keys.constants';
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
   * Reads a single row from a sheet as formatted strings.
   *
   * Trailing empty cells are dropped by the Sheets API; callers that need the
   * raw, position-aligned array should pass an explicit `toCol`.
   *
   * @param spreadsheetId - ID of the spreadsheet
   * @param sheetTitle - Title of the sheet (used in the A1 range)
   * @param row - 1-based row index
   * @param fromCol - 1-based, inclusive (default `1`)
   * @param toCol - 1-based, inclusive; omit to fetch the whole row
   */
  public async getRowValues(
    spreadsheetId: string,
    sheetTitle: string,
    row: number,
    fromCol: number = 1,
    toCol?: number
  ): Promise<string[]> {
    const range =
      toCol !== undefined
        ? `'${sheetTitle}'!${GoogleSheetsApiAdapter.colToA1(fromCol)}${row}:${GoogleSheetsApiAdapter.colToA1(toCol)}${row}`
        : `'${sheetTitle}'!${row}:${row}`;
    const resp = await this.executeWithRetry(() =>
      this.service.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'FORMATTED_VALUE',
        majorDimension: 'ROWS',
      })
    );
    return (resp.data.values?.[0] ?? []).map(v => (v == null ? '' : String(v)));
  }

  /**
   * Reads formulas from a single row of a sheet.
   *
   * Cells without a formula return an empty string. The returned array is
   * positionally aligned with `[fromCol..toCol]`.
   *
   * @param spreadsheetId - ID of the spreadsheet
   * @param sheetTitle - Title of the sheet (used in the A1 range)
   * @param row - 1-based row index
   * @param fromCol - 1-based, inclusive
   * @param toCol - 1-based, inclusive
   */
  public async getRowFormulas(
    spreadsheetId: string,
    sheetTitle: string,
    row: number,
    fromCol: number,
    toCol: number
  ): Promise<string[]> {
    const range = `'${sheetTitle}'!${GoogleSheetsApiAdapter.colToA1(fromCol)}${row}:${GoogleSheetsApiAdapter.colToA1(toCol)}${row}`;
    const resp = await this.executeWithRetry(() =>
      this.service.spreadsheets.values.get({
        spreadsheetId,
        range,
        valueRenderOption: 'FORMULA',
        majorDimension: 'ROWS',
      })
    );
    return (resp.data.values?.[0] ?? []).map(v => (typeof v === 'string' ? v : ''));
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
    return metadata.find(m => m.metadataKey === GOOGLE_SHEETS_METADATA_KEYS.REPORT_META);
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
      m =>
        m.metadataKey === GOOGLE_SHEETS_METADATA_KEYS.REPORT_META && m.location?.sheetId === sheetId
    );
  }

  /**
   * Finds OWOX column-list metadata entries for a specific sheet. The value is
   * a JSON array of column names ODM wrote into the imported range on the
   * previous refresh (see {@link GOOGLE_SHEETS_METADATA_KEYS.COLUMNS}).
   *
   * @param metadata - Array of developer metadata
   * @param sheetId - Sheet ID to filter by
   * @returns Array of OWOX_COLUMNS metadata entries for the specified sheet
   */
  public findOwoxColumnsMetadataForSheet(
    metadata: sheets_v4.Schema$DeveloperMetadata[],
    sheetId: number
  ): sheets_v4.Schema$DeveloperMetadata[] {
    return metadata.filter(
      m => m.metadataKey === GOOGLE_SHEETS_METADATA_KEYS.COLUMNS && m.location?.sheetId === sheetId
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
   * Clears values in the given A1 range while preserving cell formatting,
   * notes and structural elements. The range string must already include the
   * sheet title (e.g. `"'Sheet1'!A2:C10"`). Thin wrapper around
   * `spreadsheets.values.clear` exposed for callers that need a narrow
   * value-only clear scoped to a rectangle.
   */
  public async clearValuesInRange(spreadsheetId: string, range: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.service.spreadsheets.values.clear({ spreadsheetId, range })
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
   * Builds a `copyPaste` request that copies a single source range over a
   * destination range with the chosen paste type. With `pasteType:
   * 'PASTE_FORMULA'` Google Sheets shifts relative A1 references the same way
   * as the manual drag-fill / paste-formula does — used by the writer to
   * extend user formulas in row 2 down across freshly written data rows.
   *
   * All indexes are 0-based, end-exclusive, matching the Sheets API
   * GridRange contract. Source area is typically a single cell or row;
   * destination area is the wider rectangle to fill.
   */
  public buildCopyPasteRequest(
    sheetId: number,
    source: { startRow: number; endRow: number; startCol: number; endCol: number },
    destination: { startRow: number; endRow: number; startCol: number; endCol: number },
    pasteType: 'PASTE_FORMULA' | 'PASTE_NORMAL' | 'PASTE_VALUES' | 'PASTE_FORMAT'
  ): sheets_v4.Schema$Request {
    return {
      copyPaste: {
        source: {
          sheetId,
          startRowIndex: source.startRow,
          endRowIndex: source.endRow,
          startColumnIndex: source.startCol,
          endColumnIndex: source.endCol,
        },
        destination: {
          sheetId,
          startRowIndex: destination.startRow,
          endRowIndex: destination.endRow,
          startColumnIndex: destination.startCol,
          endColumnIndex: destination.endCol,
        },
        pasteType,
        pasteOrientation: 'NORMAL',
      },
    };
  }

  /**
   * Builds an `insertDimension` request that inserts a single empty column at
   * the given 0-based position. Existing columns at and right of `atColIndex`
   * shift right by one; A1 references in workbook formulas are recalculated
   * automatically by Sheets.
   *
   * `inheritFromBefore` is forced to `false` so that the new column starts
   * empty: the writer is the sole owner of its content and will populate the
   * header + data cells immediately after. Setting it to `true` would
   * accidentally clone user formulas/values from the column to the left.
   */
  public buildInsertColumnRequest(sheetId: number, atColIndex: number): sheets_v4.Schema$Request {
    return {
      insertDimension: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: atColIndex,
          endIndex: atColIndex + 1,
        },
        inheritFromBefore: false,
      },
    };
  }

  /**
   * Builds a `deleteDimension` request that deletes a single column at the
   * given 0-based position. Columns right of it shift left by one; formulas
   * referencing the deleted column become `#REF!`.
   */
  public buildDeleteColumnRequest(sheetId: number, atColIndex: number): sheets_v4.Schema$Request {
    return {
      deleteDimension: {
        range: {
          sheetId,
          dimension: 'COLUMNS',
          startIndex: atColIndex,
          endIndex: atColIndex + 1,
        },
      },
    };
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
   * Converts a 1-based column index to its A1 letter representation
   * (1 → "A", 26 → "Z", 27 → "AA", …). Used internally to build A1 ranges.
   */
  public static colToA1(col: number): string {
    if (col < 1 || !Number.isInteger(col)) {
      throw new Error(`colToA1 expects a positive integer, received ${col}`);
    }
    let n = col;
    let s = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
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
