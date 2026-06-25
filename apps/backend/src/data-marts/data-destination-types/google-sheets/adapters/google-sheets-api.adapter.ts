import { Logger } from '@nestjs/common';
import { JWT, OAuth2Client } from 'google-auth-library';
import { google, sheets_v4, drive_v3 } from 'googleapis';
import { GoogleServiceAccountKey } from '../../../../common/schemas/google-service-account-key.schema';
import { GOOGLE_SHEETS_METADATA_KEYS } from '../constants/google-sheets-metadata-keys.constants';
import { GoogleSheetsCredentials } from '../schemas/google-sheets-credentials.schema';

/**
 * Adapter for Google Sheets API operations
 */
export class GoogleSheetsApiAdapter {
  private static readonly SHEETS_SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];

  /**
   * Scopes for the Service-Account Drive-create path (auto-creating a Sheet in a
   * shared Drive folder). Kept SEPARATE from {@link SHEETS_SCOPE} so existing SA
   * Sheets operations keep their narrow spreadsheets-only scope and are not
   * re-minted with a broader Drive scope.
   */
  public static readonly SERVICE_ACCOUNT_DRIVE_CREATE_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ];

  private static readonly LOGGER = new Logger(GoogleSheetsApiAdapter.name);

  /**
   * Field mask used to restore a user's captured column format. It enumerates
   * every `userEnteredFormat` subfield we copy column-wide — number format,
   * colors, borders, alignment, wrap, and the cosmetic `textFormat` props —
   * but deliberately OMITS `userEnteredFormat.textFormat.link`.
   *
   * Why exclude the link: a hyperlink is per-cell content, not a column-wide
   * format. We sample one representative row's format and apply it to the whole
   * column; if `textFormat.link` were in the mask, every row would be stamped
   * with the sampled row's URL (the cell shows `…/id-5` but its link points to
   * `…/id-1`). Leaving `link` out of the mask preserves each row's own link
   * (and never propagates one row's link onto the others).
   */
  private static readonly RESTORE_FORMAT_FIELD_MASK = [
    'userEnteredFormat.numberFormat',
    'userEnteredFormat.backgroundColor',
    'userEnteredFormat.backgroundColorStyle',
    'userEnteredFormat.borders',
    'userEnteredFormat.padding',
    'userEnteredFormat.horizontalAlignment',
    'userEnteredFormat.verticalAlignment',
    'userEnteredFormat.wrapStrategy',
    'userEnteredFormat.textDirection',
    'userEnteredFormat.textRotation',
    'userEnteredFormat.hyperlinkDisplayType',
    'userEnteredFormat.textFormat.foregroundColor',
    'userEnteredFormat.textFormat.foregroundColorStyle',
    'userEnteredFormat.textFormat.fontFamily',
    'userEnteredFormat.textFormat.fontSize',
    'userEnteredFormat.textFormat.bold',
    'userEnteredFormat.textFormat.italic',
    'userEnteredFormat.textFormat.strikethrough',
    'userEnteredFormat.textFormat.underline',
    // NOTE: `userEnteredFormat.textFormat.link` is intentionally excluded.
  ].join(',');

  private readonly service: sheets_v4.Sheets;
  private readonly authClient: OAuth2Client | JWT;
  private driveService?: drive_v3.Drive;

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
    this.authClient =
      authClient ?? GoogleSheetsApiAdapter.createAuthClient(credentials!.serviceAccountKey!);
    this.service = google.sheets({ version: 'v4', auth: this.authClient });
  }

  /**
   * Lazily builds a Drive API client from the same auth as the Sheets client.
   * The underlying auth must carry a Drive scope (e.g. the SA Drive-create JWT)
   * for Drive operations to succeed.
   */
  private getDriveService(): drive_v3.Drive {
    this.driveService ??= google.drive({ version: 'v3', auth: this.authClient });
    return this.driveService;
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
   * Creates a new, empty Google Spreadsheet with its single default sheet.
   *
   * Used by the "Create document" auto-creation flow. The first sheet's numeric
   * `sheetId` is read from the create response — it is NOT assumed to be `0`,
   * because Google does not guarantee the default sheet's id.
   *
   * Requires the `spreadsheets` scope only (no Drive scope) — the file lands in
   * the authenticated account's Drive root. Folder placement is a later phase.
   *
   * @param title - Title for the new spreadsheet
   * @returns The new spreadsheet ID and its first sheet's numeric ID
   */
  public async createSpreadsheet(
    title: string
  ): Promise<{ spreadsheetId: string; sheetId: number }> {
    const resp = await this.executeWithRetry(() =>
      this.service.spreadsheets.create({
        requestBody: { properties: { title } },
        fields: 'spreadsheetId,sheets.properties.sheetId',
      })
    );
    const spreadsheetId = resp.data.spreadsheetId;
    const sheetId = resp.data.sheets?.[0]?.properties?.sheetId;
    if (!spreadsheetId || sheetId === undefined || sheetId === null) {
      throw new Error('Google Sheets API did not return a spreadsheetId or sheetId on create');
    }
    return { spreadsheetId, sheetId };
  }

  /**
   * Creates a new Google Spreadsheet directly inside a Drive folder via the
   * Drive API (so the file lands in a shared Drive folder, not the caller's
   * Drive root). Requires the underlying auth to carry a Drive scope and is used
   * by the Service-Account auto-creation path.
   *
   * `supportsAllDrives` is set so the create works in a Shared Drive. The first
   * sheet's numeric `sheetId` is fetched from the Sheets API afterwards (Drive
   * create does not return it) — it is NOT assumed to be `0`.
   *
   * @param title - Title for the new spreadsheet
   * @param folderId - Drive folder ID to create the spreadsheet in
   * @returns The new spreadsheet ID and its first sheet's numeric ID
   */
  public async createSpreadsheetInFolder(
    title: string,
    folderId: string
  ): Promise<{ spreadsheetId: string; sheetId: number }> {
    const drive = this.getDriveService();
    const file = await this.executeWithRetry(() =>
      drive.files.create({
        requestBody: {
          name: title,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [folderId],
        },
        fields: 'id',
        supportsAllDrives: true,
      })
    );
    const spreadsheetId = file.data.id;
    if (!spreadsheetId) {
      throw new Error('Drive API did not return a file id when creating the spreadsheet');
    }
    const ss = await this.executeWithRetry(() =>
      this.service.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.sheetId' })
    );
    const sheetId = ss.data.sheets?.[0]?.properties?.sheetId;
    if (sheetId === undefined || sheetId === null) {
      throw new Error('Could not resolve the sheetId of the newly created spreadsheet');
    }
    return { spreadsheetId, sheetId };
  }

  /**
   * Reads Drive folder metadata to validate write access for the auto-creation
   * flow. Returns a structured result instead of throwing, so callers can build
   * precise messages. A failed lookup (folder missing, not shared, or no access)
   * returns `accessible: false`. Requires the underlying auth to carry a Drive
   * scope.
   *
   * @param folderId - Drive folder ID to inspect
   */
  public async getFolderAccess(folderId: string): Promise<{
    accessible: boolean;
    isFolder: boolean;
    isSharedDrive: boolean;
    canAddChildren: boolean;
  }> {
    const drive = this.getDriveService();
    try {
      const res = await this.executeWithRetry(() =>
        drive.files.get({
          fileId: folderId,
          fields: 'id, mimeType, driveId, capabilities/canAddChildren',
          supportsAllDrives: true,
        })
      );
      const data = res.data;
      return {
        accessible: true,
        isFolder: data.mimeType === 'application/vnd.google-apps.folder',
        isSharedDrive: !!data.driveId,
        canAddChildren: data.capabilities?.canAddChildren === true,
      };
    } catch (error) {
      GoogleSheetsApiAdapter.LOGGER.warn(
        `getFolderAccess: cannot access folder ${folderId}`,
        error instanceof Error ? error.message : String(error)
      );
      return { accessible: false, isFolder: false, isSharedDrive: false, canAddChildren: false };
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
   * Reads, for each column in a span, the first non-empty user-entered cell
   * format found while scanning a window of data rows top-down. Used to
   * capture the formatting a user applied to the imported columns *before* the
   * writer overwrites their values, so it can be restored afterwards. This
   * covers the full `userEnteredFormat` — number/date/currency format,
   * background & text colors, bold/italic, alignment, borders, wrap — not just
   * the number format (the `USER_ENTERED` value write re-derives the number
   * format, and restoring the whole format keeps the contract consistent).
   *
   * Why a window and not a single row: a format applied to a whole column sits
   * on every cell (including blank ones), so row 2 alone usually suffices. But
   * when row 2 happens to be unformatted while the rest of the column carries
   * the user's format (e.g. only the data rows were formatted, or row 2 was
   * reset by a prior buggy run), a single-row sample would miss it. Scanning a
   * bounded window and taking the first formatted cell per column recovers
   * that case in one request.
   *
   * The returned array is positionally aligned with `[fromCol..toCol]`; a slot
   * is `undefined` when no cell in the window carries an explicit format
   * (default / "Automatic" column). Returns all-`undefined` (and never throws)
   * when the requested range lies outside the current grid.
   *
   * The target sheet is selected by `sheetId`, not by position: `ranges` only
   * limits which grid-data portions are included in the response, it does NOT
   * guarantee that `sheets[0]` is the requested tab. Relying on `sheets[0]`
   * would read empty/other-tab grid data for any destination that is not the
   * first sheet, silently skipping the format restore.
   *
   * @param spreadsheetId - ID of the spreadsheet
   * @param sheetId - ID of the destination sheet to read from
   * @param sheetTitle - Title of the sheet (used in the A1 range)
   * @param rowFrom - 1-based first row of the sample window, inclusive
   * @param rowTo - 1-based last row of the sample window, inclusive
   * @param fromCol - 1-based, inclusive
   * @param toCol - 1-based, inclusive
   */
  public async getColumnFormats(
    spreadsheetId: string,
    sheetId: number,
    sheetTitle: string,
    rowFrom: number,
    rowTo: number,
    fromCol: number,
    toCol: number
  ): Promise<(sheets_v4.Schema$CellFormat | undefined)[]> {
    const width = toCol - fromCol + 1;
    if (width <= 0 || rowTo < rowFrom) {
      return [];
    }
    const range = `'${sheetTitle}'!${GoogleSheetsApiAdapter.colToA1(fromCol)}${rowFrom}:${GoogleSheetsApiAdapter.colToA1(toCol)}${rowTo}`;
    const resp = await this.executeWithRetry(() =>
      this.service.spreadsheets.get({
        spreadsheetId,
        ranges: [range],
        includeGridData: true,
        fields: 'sheets(properties(sheetId),data(rowData(values(userEnteredFormat))))',
      })
    );
    const sheet = resp.data.sheets?.find(s => s.properties?.sheetId === sheetId);
    if (!sheet) {
      // The destination tab was not present in the response — capture cannot
      // proceed for this refresh. Surface it: silently returning all-undefined
      // would be indistinguishable from "user set no formats".
      GoogleSheetsApiAdapter.LOGGER.warn(
        `getColumnFormats: sheetId ${sheetId} not found in spreadsheet ` +
          `${spreadsheetId} response; column formats will not be restored this refresh.`
      );
      return new Array(width).fill(undefined);
    }
    const rowData = sheet.data?.[0]?.rowData ?? [];
    const formats: (sheets_v4.Schema$CellFormat | undefined)[] = new Array(width).fill(undefined);
    for (let i = 0; i < width; i++) {
      // First non-empty format wins, scanning the window top-down.
      for (const row of rowData) {
        const fmt = row.values?.[i]?.userEnteredFormat;
        if (fmt && Object.keys(fmt).length > 0) {
          formats[i] = fmt;
          break;
        }
      }
    }
    return formats;
  }

  /**
   * Builds a `repeatCell` request that applies a captured cell format to every
   * cell of a single column within a row span. The field mask restores the set
   * of user-applied formatting — number format, background/text colors,
   * bold/italic, horizontal & vertical alignment, borders, wrap, padding,
   * etc. — but deliberately EXCLUDES `textFormat.link` (a per-cell hyperlink is
   * content, not a column-wide format; see
   * {@link GoogleSheetsApiAdapter.RESTORE_FORMAT_FIELD_MASK}). Subfields inside
   * the mask that are absent from `format` are reset to default on the range;
   * subfields outside the mask (notably each cell's own link) are left
   * untouched.
   *
   * Sheet-level constructs (conditional formatting, data validation) live
   * outside `userEnteredFormat` and are intentionally NOT touched here — the
   * value write does not affect them either.
   *
   * All indexes are 0-based; `startRowIndex` is inclusive, `endRowIndex`
   * exclusive (Sheets API GridRange contract).
   */
  public buildSetColumnFormatRequest(
    sheetId: number,
    columnIndex: number,
    startRowIndex: number,
    endRowIndex: number,
    format: sheets_v4.Schema$CellFormat
  ): sheets_v4.Schema$Request {
    return {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex,
          endRowIndex,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1,
        },
        cell: {
          userEnteredFormat: format,
        },
        fields: GoogleSheetsApiAdapter.RESTORE_FORMAT_FIELD_MASK,
      },
    };
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
   * Builds a Service-Account JWT with explicit scopes. Used to mint a
   * Drive-capable client for the auto-creation path without widening the global
   * {@link SHEETS_SCOPE} used by all other SA operations.
   */
  public static createServiceAccountClient(
    serviceAccountKey: GoogleServiceAccountKey,
    scopes: string[]
  ): JWT {
    return new JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes,
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
