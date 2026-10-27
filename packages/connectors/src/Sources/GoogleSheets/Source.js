/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

// Only the base class is imported, matching every other source: CONFIG_ATTRIBUTES,
// DATA_TYPES, LOG_LEVEL, PARAMETER_OWNER, HTTP_STATUS, OAUTH_CONSTANTS, OAuthUtils,
// AsyncUtils, OauthCredentialsDto and the exception classes are bare globals the built
// bundle supplies. Every name used here must be one the bundle actually defines —
// an undefined global is only a runtime ReferenceError, never a build or lint error.
import { AbstractSource } from '../../Core/AbstractSource.js';

const GOOGLE_SHEETS_MAX_IDENTIFIER_BYTES = 127;
const GOOGLE_SHEETS_PREVIEW_SAMPLE_ROWS = 100;
const GOOGLE_SHEETS_MAX_IMPORT_ROWS = 100000;
const GOOGLE_SHEETS_MAX_IMPORT_COLUMNS = 1598;
const GOOGLE_SHEETS_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const GOOGLE_SHEETS_MAX_RETRY_AFTER_MS = 300000;
const GOOGLE_SHEETS_REQUIRED_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];
// Google Sheets counts date serials in days from 1899-12-30.
const GOOGLE_SHEETS_SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);
const GOOGLE_SHEETS_MS_PER_DAY = 24 * 60 * 60 * 1000;
// The OutputSchemaFieldTypes class of a field the Output Schema declares as DATE.
const GOOGLE_SHEETS_OUTPUT_SCHEMA_DATE = 'DATE';
// Cell formats a declared DATE column takes the calendar day from. A time-only or duration
// cell (format TIME) has no calendar day, so it is not among them.
const GOOGLE_SHEETS_DATE_CELL_FORMATS = new Set(['DATE', 'DATE_TIME']);
// How many row numbers a run-log warning lists before it summarises the rest.
const GOOGLE_SHEETS_MAX_LOGGED_ROWS = 10;
// Cells per date-column read request. A cell with its text, serial and format is about 120
// bytes of JSON, so a request stays far below the 50 MB response limit.
const GOOGLE_SHEETS_MAX_CELLS_PER_DATE_READ = 200000;
// Characters of encoded ranges per date-column read request. Every column is its own `ranges`
// query parameter, and a non-ASCII tab name takes several characters per letter once encoded,
// so this keeps the request URL well within what Google accepts.
const GOOGLE_SHEETS_MAX_RANGES_LENGTH_PER_DATE_READ = 4000;
// The values read and the date-column read are two snapshots. When they disagree, the sheet
// is read once more; if they still disagree, the dates are taken from the date-column read,
// with a warning. They are not emptied instead: if the two reads ever rendered a date format
// differently, every date of the column would then be lost on every run.
const GOOGLE_SHEETS_DATE_READ_ATTEMPTS = 2;

export class GoogleSheetsSource extends AbstractSource {
  // Tells OWOX Data Marts to pass the Data Mart's Output Schema types in OutputSchemaFieldTypes.
  static readsOutputSchemaFieldTypes = true;

  constructor(context) {
    super(context);

    // Read before registration: registerParameters() applies the declared default
    // to a param the user left empty, so an explicit `false` has to be captured first.
    const inferTypesDefault = context.getParameter('InferTypes')?.value === false ? false : true;
    const importAllColumnsDefault =
      context.getParameter('ImportAllColumns')?.value === false ? false : true;

    this.parameters = {
      AuthType: {
        requiredType: 'object',
        label: 'Auth Type',
        description: 'Authentication type',
        isRequired: true,
        oneOf: [
          {
            label: 'OAuth2',
            value: 'oauth2',
            requiredType: 'object',
            attributes: [CONFIG_ATTRIBUTES.OAUTH_FLOW],
            oauthParams: {
              vars: {
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_GOOGLE_SHEETS_CLIENT_ID',
                  attributes: [
                    OAUTH_CONSTANTS.UI,
                    OAUTH_CONSTANTS.SECRET,
                    OAUTH_CONSTANTS.REQUIRED,
                  ],
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_GOOGLE_SHEETS_CLIENT_SECRET',
                  attributes: [OAUTH_CONSTANTS.SECRET, OAUTH_CONSTANTS.REQUIRED],
                },
                RedirectUri: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_GOOGLE_SHEETS_REDIRECT_URI',
                  attributes: [OAUTH_CONSTANTS.UI, OAUTH_CONSTANTS.REQUIRED],
                },
                PickerApiKey: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_GOOGLE_SHEETS_PICKER_API_KEY',
                  attributes: [
                    OAUTH_CONSTANTS.UI,
                    OAUTH_CONSTANTS.SECRET,
                    OAUTH_CONSTANTS.REQUIRED,
                  ],
                },
                ProjectNumber: {
                  type: 'string',
                  required: true,
                  store: 'env',
                  key: 'OAUTH_GOOGLE_SHEETS_PROJECT_NUMBER',
                  attributes: [
                    OAUTH_CONSTANTS.UI,
                    OAUTH_CONSTANTS.SECRET,
                    OAUTH_CONSTANTS.REQUIRED,
                  ],
                },
              },
              mapping: {
                RefreshToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'refresh_token',
                },
                AccessToken: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'access_token',
                },
                ClientId: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_id',
                },
                ClientSecret: {
                  type: 'string',
                  required: true,
                  store: 'secret',
                  key: 'client_secret',
                },
              },
            },
            items: {
              RefreshToken: {
                isRequired: true,
                requiredType: 'string',
                label: 'Refresh Token',
                description: 'OAuth2 Refresh Token',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
              ClientId: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client ID',
                description: 'OAuth2 Client ID',
              },
              ClientSecret: {
                isRequired: true,
                requiredType: 'string',
                label: 'Client Secret',
                description: 'OAuth2 Client Secret',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
          {
            label: 'Service Account',
            value: 'service_account',
            requiredType: 'object',
            items: {
              ServiceAccountKey: {
                isRequired: true,
                requiredType: 'string',
                label: 'Service Account Key (JSON)',
                description:
                  'Paste a JSON key from a service account that has access to the selected spreadsheet.',
                placeholder: 'Paste the full service account JSON key',
                attributes: [CONFIG_ATTRIBUTES.SECRET],
              },
            },
          },
        ],
      },
      SpreadsheetId: {
        isRequired: true,
        requiredType: 'string',
        label: 'Spreadsheet ID or URL',
        description:
          'Choose a spreadsheet with Google Picker for OAuth, or enter its ID or URL for a service account.',
      },
      SheetName: {
        isRequired: true,
        requiredType: 'string',
        label: 'Sheet Name',
        description:
          'Sheet tab to import. The list is loaded from the selected spreadsheet. One Data Mart imports one sheet tab.',
        attributes: [CONFIG_ATTRIBUTES.DYNAMIC_OPTIONS],
        optionsDependsOn: ['AuthType', 'SpreadsheetId'],
      },
      Range: {
        requiredType: 'string',
        default: '',
        label: 'Range',
        description:
          'Optional A1 range inside the selected sheet, for example A:D. Leave empty to import the used range.',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      HeaderRow: {
        isRequired: true,
        requiredType: 'number',
        default: 1,
        minimum: 1,
        label: 'Header Row',
        description:
          'One-based row number containing column names. The rows below it are imported as data.',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      InferTypes: {
        requiredType: 'boolean',
        default: inferTypesDefault,
        label: 'Infer Types',
        description:
          'Infer warehouse column types from sheet values. Mixed columns fall back to STRING.',
        attributes: [CONFIG_ATTRIBUTES.ADVANCED],
      },
      ImportAllColumns: {
        requiredType: 'boolean',
        default: importAllColumnsDefault,
        label: 'Import All Columns',
        description:
          'Import every current sheet column, including columns added after setup. Disable to use the explicit Fields selection.',
        attributes: [CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      Fields: {
        requiredType: 'string',
        default: 'sheet _owox_row_number',
        label: 'Fields',
        description: 'Generated at runtime from the selected sheet headers',
        attributes: [CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
      // No default on purpose: the setup form copies declared defaults into the saved
      // configuration, and this value must only ever come from the backend at run time.
      OutputSchemaFieldTypes: {
        requiredType: 'string',
        label: 'Output Schema Field Types',
        description:
          'Set at run time from the Data Mart Output Schema: {"fields": {name: "DATE" | "OTHER"}, "unlistedColumns": "INFER" | "KEEP"}',
        attributes: [CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
      },
    };

    this._registerParameters();

    this.fieldsSchema = this._buildPlaceholderFieldsSchema();
    this.accessToken = null;
    this.tokenExpiryTime = null;
  }

  async exchangeOauthCredentials(credentials, variables) {
    try {
      const tokenUrl = 'https://oauth2.googleapis.com/token';
      const payload = {
        client_id: variables.ClientId,
        client_secret: variables.ClientSecret,
        grant_type: 'authorization_code',
        code: credentials.code,
        redirect_uri: variables.RedirectUri,
      };

      // Bare fetch, matching GoogleAds and MicrosoftAds, rather than
      // this.urlFetchWithRetry(). Three reasons, all specific to this method:
      //   - `code` is a single-use authorization code. Retrying a failed exchange
      //     cannot succeed, and this runs synchronously inside the user's OAuth
      //     callback, where isValidToRetry()'s 5s/10s backoff is dead wait.
      //   - Google reports OAuth failures as HTTP 400 with the reason in the body
      //     ({"error":"invalid_grant",...}). urlFetchWithRetry throws on non-ok
      //     before the `data.error` branch below could turn that into a message
      //     naming the actual problem.
      //   - urlFetchWithRetry reads this.context (getParameter/emit/log). `this`
      //     IS the source here — connector.service.ts calls this as a method — but
      //     on an instance built purely to make this call, whose context carries an
      //     empty config and no run. Depending on it would be depending on a
      //     placeholder; the tests construct the source with no context at all.
      // It also loses nothing: urlFetchWithRetry only re-validates redirects when
      // given a `validate` callback, and bundled sources pass none — without one it
      // delegates to the same undici transparent follow that bare fetch uses.
      const response = await fetch(tokenUrl, {
        method: 'post',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: Object.entries(payload)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&'),
      });
      // Deliberately not gated on response.ok: a non-2xx body is exactly where the
      // provider's error code lives, and the `data.error` check below reads it.
      const data = await response.json();

      if (data.error) {
        throw new OauthFlowException({
          message: `Token exchange failed: ${data.error_description || data.error}`,
          payload: data,
        });
      }

      if (!data.refresh_token) {
        throw new OauthFlowException({
          message:
            'No refresh_token returned. Please revoke access at https://myaccount.google.com/permissions and try again.',
          payload: data,
        });
      }

      const grantedScopes = new Set(
        String(data.scope || '')
          .split(/\s+/)
          .filter(Boolean)
      );
      const missingScopes = GOOGLE_SHEETS_REQUIRED_OAUTH_SCOPES.filter(
        scope => !grantedScopes.has(scope)
      );
      if (missingScopes.length) {
        throw new OauthFlowException({
          message:
            'Google Sheets authorization is missing required permissions. Reconnect and allow Google Drive file access and email address access.',
          payload: { missingScopes },
        });
      }

      let userInfo;
      try {
        // Bare fetch for the same reasons as the token exchange above. A failure
        // here — transport, non-2xx, or a non-JSON body — is caught below and
        // reported as an unverifiable account, which is the actionable message.
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        userInfo = await userResponse.json();
      } catch (error) {
        throw new OauthFlowException({
          message: 'Could not verify the Google account connected to Google Sheets',
          payload: error.message,
        });
      }

      if (typeof userInfo.email !== 'string' || !userInfo.email.includes('@')) {
        throw new OauthFlowException({
          message: 'Google did not return the email address required by Google Picker',
          payload: userInfo,
        });
      }

      const userData = {
        id: userInfo.id || userInfo.email,
        name: userInfo.email,
        email: userInfo.email,
      };

      return OauthCredentialsDto.builder()
        .withUser(userData)
        .withSecret({
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          client_id: variables.ClientId,
          client_secret: variables.ClientSecret,
        })
        // The stored credential is backed by the refresh token. The access
        // token's one-hour lifetime must not make the connection look expired.
        .withExpiresIn(data.refresh_token_expires_in ?? null)
        .build()
        .toObject();
    } catch (error) {
      if (error instanceof OauthFlowException) {
        throw error;
      }
      throw new OauthFlowException({
        message: 'Failed to exchange Google Sheets tokens',
        payload: error.message,
      });
    }
  }

  async getAccessToken({ forceRefresh = false } = {}) {
    if (
      !forceRefresh &&
      this.accessToken &&
      this.tokenExpiryTime &&
      Date.now() < this.tokenExpiryTime
    ) {
      return this.accessToken;
    }

    if (forceRefresh) {
      this.accessToken = null;
      this.tokenExpiryTime = null;
    }

    const authType = this.context.getParameter('AuthType')?.value;
    if (!authType) {
      throw new ConnectorConfigurationException('AuthType not configured');
    }

    const authConfig = this.context.getParameter('AuthType')?.items;
    if (authType === 'oauth2') {
      // Resolve the items first so a missing one is reported before any request.
      const formData = {
        grant_type: 'refresh_token',
        client_id: this._requireAuthItem(authConfig, 'ClientId'),
        client_secret: this._requireAuthItem(authConfig, 'ClientSecret'),
        refresh_token: this._requireAuthItem(authConfig, 'RefreshToken'),
      };
      this.accessToken = await OAuthUtils.getAccessToken({
        context: this.context,
        tokenUrl: 'https://oauth2.googleapis.com/token',
        formData,
      });
    } else if (authType === 'service_account') {
      const serviceAccountKeyJson = this._requireAuthItem(authConfig, 'ServiceAccountKey');
      this.accessToken = await OAuthUtils.getServiceAccountToken({
        context: this.context,
        tokenUrl: 'https://oauth2.googleapis.com/token',
        serviceAccountKeyJson,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      });
    } else {
      throw new ConnectorConfigurationException(
        `Unsupported Google Sheets authentication type: ${authType}`
      );
    }
    this.tokenExpiryTime = Date.now() + (3600 - 60) * 1000;

    return this.accessToken;
  }

  /**
   * Reads one item of the selected authentication type.
   *
   * A missing item has to surface as a configuration error: as a TypeError it would be
   * reported as the provider being unavailable.
   */
  _requireAuthItem(authConfig, itemName) {
    const value = authConfig?.[itemName]?.value;
    if (value === undefined || value === null || value === '') {
      throw new ConnectorConfigurationException(
        `Parameter 'AuthType.${itemName}' is required but was not provided`
      );
    }
    return value;
  }

  async fetchData() {
    for (let attempt = 1; ; attempt += 1) {
      const values = await this._fetchSheetValues();
      const snapshot = this._buildSheetSnapshot(values, true);
      const isLastAttempt = attempt >= GOOGLE_SHEETS_DATE_READ_ATTEMPTS;
      const { columnTypes, sheetChanged } = await this._convertDateColumns(snapshot, {
        acceptSheetChanges: isLastAttempt,
      });
      if (sheetChanged && !isLastAttempt) {
        this.context.log(
          LOG_LEVEL.INFO,
          'The sheet changed while it was being read; reading it again'
        );
        continue;
      }

      const schema = this._inferSchema(snapshot.columns, snapshot.rows, { columnTypes });
      this._setDynamicFieldsSchema(schema);
      return snapshot.rows;
    }
  }

  async fetchFieldsSchema(signal) {
    const values = await this._fetchSheetValues({ preview: true, signal });
    const snapshot = this._buildSheetSnapshot(values, false, {
      returnedRangeStartRow: this._getHeaderRowNumber(),
    });

    // Preview types only describe the sheet, so a failed date check falls back to the types
    // the values alone give instead of failing the whole preview.
    let columnTypes = {};
    try {
      ({ columnTypes } = await this._convertDateColumns(snapshot, {
        signal,
        acceptSheetChanges: true,
      }));
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason || error;
      }
      this.context.log(
        LOG_LEVEL.WARN,
        `Could not check the sheet for date columns: ${error?.message ?? error}`
      );
    }

    const schema = this._inferSchema(snapshot.columns, snapshot.rows, {
      includeImportedAt: true,
      columnTypes,
    });
    return this._buildFieldsSchema(schema);
  }

  async _fetchSheetValues({ preview = false, signal } = {}) {
    const spreadsheetId = this._extractSpreadsheetId(
      this.context.getParameter('SpreadsheetId')?.value
    );
    const encodedSpreadsheetId = encodeURIComponent(spreadsheetId);
    const range = this._buildA1Range({ preview });
    const encodedRange = encodeURIComponent(range);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodedSpreadsheetId}/values/${encodedRange}` +
      '?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

    const payload = await this._fetchSheetsApiJson(url, { signal });
    return Array.isArray(payload.values) ? payload.values : [];
  }

  /**
   * Reads cell data for one or more A1 ranges of the selected sheet with `spreadsheets.get`.
   *
   * Every range comes back as its own block, in request order, with the zero-based row and
   * column it starts at; those are used to place each cell instead of assuming the block starts
   * at the requested row.
   *
   * @param {string[]} ranges - A1 ranges, sheet name included
   * @param {string} cellFields - Field mask of the CellData fields to read
   * @param {Object} options
   * @param {AbortSignal} [options.signal]
   * @param {string} options.oversizeMessage
   * @returns {Promise<Array<{startRowNumber: number, startColumnNumber: number, rows: Array<Array<Object>>}>>}
   *   One block per range; row and column numbers are one-based sheet coordinates.
   */
  async _fetchGridData(ranges, cellFields, { signal, oversizeMessage }) {
    const spreadsheetId = this._extractSpreadsheetId(
      this.context.getParameter('SpreadsheetId')?.value
    );
    const query = ranges.map(range => `ranges=${encodeURIComponent(range)}`).join('&');
    const fields = `sheets(data(startRow,startColumn,rowData(values(${cellFields}))))`;
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
      `?${query}&fields=${encodeURIComponent(fields)}`;

    const payload = await this._fetchSheetsApiJson(url, { signal, oversizeMessage });
    const blocks = payload?.sheets?.[0]?.data;
    return ranges.map((range, index) => {
      const block = Array.isArray(blocks) ? blocks[index] : undefined;
      const requested = this._parseA1GridRange(range.slice(range.lastIndexOf('!') + 1));
      return {
        // Zero-based in the response, and left out when zero.
        startRowNumber: Number.isInteger(block?.startRow)
          ? block.startRow + 1
          : (requested?.startRow ?? 1),
        startColumnNumber: Number.isInteger(block?.startColumn)
          ? block.startColumn + 1
          : (requested?.startColumn ?? 1),
        rows: Array.isArray(block?.rowData)
          ? block.rowData.map(row => (Array.isArray(row?.values) ? row.values : []))
          : [],
      };
    });
  }

  /**
   * Reads the number format type of every cell in the preview sample: the header row and up to
   * 100 data rows below it, across the same columns as the preview read.
   *
   * @param {AbortSignal} [signal]
   * @returns {Promise<function(number, number): (string|null)>} Looks up the format type by
   *   sheet row number and snapshot column index; null when the cell has none or was not read.
   */
  async _fetchSampleNumberFormatTypes(signal) {
    const [block] = await this._fetchGridData(
      [this._buildA1Range({ preview: true })],
      'effectiveFormat(numberFormat(type))',
      {
        signal,
        oversizeMessage:
          'Google Sheets response exceeds the 50 MB limit while reading cell formats. Narrow the Range and try again.',
      }
    );
    const firstColumnNumber = this._getConfiguredRangeBounds().startColumn || 1;
    return (rowNumber, columnIndex) =>
      block.rows[rowNumber - block.startRowNumber]?.[
        firstColumnNumber + columnIndex - block.startColumnNumber
      ]?.effectiveFormat?.numberFormat?.type ?? null;
  }

  /**
   * Splits the columns to read cell by cell into requests. A request holds whole columns and
   * stays within both the cell budget, for the response size, and the ranges length budget, for
   * the URL length; it always holds at least one column.
   *
   * @param {Array<{column: {index: number}}>} targets - Columns to read, in order
   * @param {number} lastRowNumber - The last sheet row the snapshot holds
   * @returns {Array<{targets: Array<Object>, ranges: string[], columnNumbers: number[]}>}
   */
  _planDateColumnReads(targets, lastRowNumber) {
    const sheetPrefix = `${this._quoteSheetName(this.context.getParameter('SheetName')?.value)}!`;
    const firstColumnNumber = this._getConfiguredRangeBounds().startColumn || 1;
    const firstRowNumber = this._getHeaderRowNumber() + 1;
    const rowCount = Math.max(1, lastRowNumber - firstRowNumber + 1);

    const batches = [];
    let batch = null;
    for (const target of targets) {
      const columnNumber = firstColumnNumber + target.column.index;
      const letters = this._columnNumberToLetters(columnNumber);
      const range = `${sheetPrefix}${letters}${firstRowNumber}:${letters}${lastRowNumber}`;
      const rangeLength = `ranges=${encodeURIComponent(range)}&`.length;
      if (
        !batch ||
        batch.cellCount + rowCount > GOOGLE_SHEETS_MAX_CELLS_PER_DATE_READ ||
        batch.rangesLength + rangeLength > GOOGLE_SHEETS_MAX_RANGES_LENGTH_PER_DATE_READ
      ) {
        batch = { targets: [], ranges: [], columnNumbers: [], cellCount: 0, rangesLength: 0 };
        batches.push(batch);
      }
      batch.targets.push(target);
      batch.ranges.push(range);
      batch.columnNumbers.push(columnNumber);
      batch.cellCount += rowCount;
      batch.rangesLength += rangeLength;
    }
    return batches;
  }

  /**
   * Reads one request's columns as the sheet stores them: each cell's displayed text, its date
   * serial (dates, times and durations are numbers underneath), and its number format type.
   *
   * @param {{targets: Array<{column: {index: number}}>, ranges: string[], columnNumbers: number[]}} batch
   *   One request from _planDateColumnReads
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Map<number, Map<number, {formattedValue: *, serial: *, formatType: (string|null)}>>>}
   *   Column index to (sheet row number to cell)
   */
  async _fetchDateColumnCells(batch, { signal } = {}) {
    const blocks = await this._fetchGridData(
      batch.ranges,
      'formattedValue,effectiveValue(numberValue),effectiveFormat(numberFormat(type))',
      {
        signal,
        oversizeMessage:
          'Google Sheets response exceeds the 50 MB limit while reading date columns. Narrow the Range and try again.',
      }
    );

    const cellsByColumn = new Map();
    batch.targets.forEach(({ column }, index) => {
      const block = blocks[index];
      const columnOffset = batch.columnNumbers[index] - block.startColumnNumber;
      const cells = new Map();
      block.rows.forEach((row, rowOffset) => {
        const cell = row[columnOffset];
        cells.set(block.startRowNumber + rowOffset, {
          formattedValue: cell?.formattedValue,
          serial: cell?.effectiveValue?.numberValue,
          formatType: cell?.effectiveFormat?.numberFormat?.type ?? null,
        });
      });
      cellsByColumn.set(column.index, cells);
    });
    return cellsByColumn;
  }

  /**
   * Lists the tabs of the selected spreadsheet, for the SheetName field's option list.
   *
   * Sorted by the spreadsheet's own tab order rather than alphabetically: the picker should
   * read like the tab strip the user is looking at.
   *
   * @param {AbortSignal} [signal] - Cancels the provider request
   * @returns {Promise<Array<{value: string, label: string}>>}
   */
  async _fetchSheetTabs(signal) {
    const spreadsheetId = this._extractSpreadsheetId(
      this.context.getParameter('SpreadsheetId')?.value
    );
    const encodedSpreadsheetId = encodeURIComponent(spreadsheetId);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodedSpreadsheetId}` +
      '?fields=sheets.properties(sheetId,title,index)';

    const payload = await this._fetchSheetsApiJson(url, {
      signal,
      oversizeMessage:
        'Google Sheets response exceeds the 50 MB limit while listing the spreadsheet tabs.',
    });
    const sheets = Array.isArray(payload.sheets) ? payload.sheets : [];

    return sheets
      .map(sheet => sheet?.properties)
      .filter(properties => typeof properties?.title === 'string' && properties.title !== '')
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map(properties => ({ value: properties.title, label: properties.title }));
  }

  /**
   * Lists the values a configuration field can take, resolved from the selected
   * spreadsheet. Only `SheetName` is dynamic: it returns the spreadsheet's tabs.
   *
   * @param {string} fieldName - Configuration field declared with DYNAMIC_OPTIONS
   * @param {AbortSignal} [signal] - Cancels the provider request
   * @returns {Promise<Array<{value: string, label: string}>>}
   */
  async fetchFieldOptions(fieldName, signal) {
    if (fieldName !== 'SheetName') {
      throw new ConnectorConfigurationException(
        `Field '${fieldName}' does not provide dynamic options`
      );
    }

    return this._fetchSheetTabs(signal);
  }

  /**
   * Performs an authorized Google Sheets API request and parses its JSON body.
   *
   * Shared by the value read and the tab listing: refreshes the access token and retries
   * once on HTTP 401, enforces the response size limit, and wraps provider failures into
   * HttpRequestException.
   */
  async _fetchSheetsApiJson(
    url,
    {
      signal,
      oversizeMessage = 'Google Sheets response exceeds the 50 MB import limit. Narrow the Range and try again.',
    } = {}
  ) {
    for (let authorizationAttempt = 0; authorizationAttempt < 2; authorizationAttempt += 1) {
      try {
        signal?.throwIfAborted();
        const accessToken = await this.getAccessToken({
          forceRefresh: authorizationAttempt > 0,
        });
        const response = await this._fetchSheetResponse(url, accessToken, signal);
        const contentLength = Number(response.headers?.get?.('content-length'));
        if (Number.isFinite(contentLength) && contentLength > GOOGLE_SHEETS_MAX_RESPONSE_BYTES) {
          throw new ConnectorConfigurationException(oversizeMessage);
        }
        const responseText = await response.text();
        const responseBytes =
          typeof Buffer === 'undefined'
            ? responseText.length
            : Buffer.byteLength(responseText, 'utf8');
        if (responseBytes > GOOGLE_SHEETS_MAX_RESPONSE_BYTES) {
          throw new ConnectorConfigurationException(oversizeMessage);
        }
        return JSON.parse(responseText);
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason || error;
        }

        if (error?.statusCode === HTTP_STATUS.UNAUTHORIZED && authorizationAttempt === 0) {
          this.context.log(
            LOG_LEVEL.INFO,
            'Google Sheets access token was rejected; refreshing it and retrying once'
          );
          continue;
        }

        const requestError = new HttpRequestException({
          message: this._buildSheetRequestErrorMessage(error),
          statusCode: error?.statusCode,
          payload: error?.payload,
        });
        requestError.cause = error;
        throw requestError;
      }
    }

    throw new Error('Google Sheets authorization retry loop ended unexpectedly');
  }

  async _fetchSheetResponse(url, accessToken, signal) {
    // Read through the base helper, not getParameter() directly: a blank or non-numeric
    // value would make `attempt <= NaN` skip the loop entirely — zero requests, and a
    // bare "retry loop ended unexpectedly" instead of the real error.
    const maxAttempts = this._getRetryParam('MaxFetchRetries', 3);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let response;

      try {
        signal?.throwIfAborted();
        // Bare fetch, matching GoogleAds, rather than this.urlFetchWithRetry():
        // this method IS the retry loop, and nesting urlFetchWithRetry's own loop
        // inside it would multiply the attempt budget (3 x 3) and hide every inner
        // attempt from the Retry-After and abort handling below. urlFetchWithRetry's
        // other extras do not apply here — its SSRF and redirect re-validation run
        // only when a `validate` callback is passed, which bundled sources never do,
        // and the host is the hardcoded sheets.googleapis.com (the spreadsheet id is
        // regex-validated and both id and range are percent-encoded).
        //
        // Non-2xx is not a throw for native fetch, so the status check that
        // _fetchSheetValues and _shouldRetry depend on is explicit below.
        response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        });
        return await this._validateResponse(response);
      } catch (error) {
        if (signal?.aborted) {
          throw signal.reason || error;
        }

        if (error?.statusCode === HTTP_STATUS.UNAUTHORIZED) {
          throw error;
        }

        if (!this._shouldRetry(error, attempt, maxAttempts)) {
          throw error;
        }

        const retryAfterMs = this._getRetryAfterMs(response);
        const delay = retryAfterMs ?? this.calculateBackoff(attempt - 1);
        this.context.log(
          LOG_LEVEL.INFO,
          `Retrying Google Sheets request after ${Math.round(delay / 1000)}s`
        );
        await this._delayWithAbort(delay, signal);
      }
    }

    throw new Error('Google Sheets request retry loop ended unexpectedly');
  }

  /**
   * Turns a non-2xx response into the HttpRequestException the callers expect.
   *
   * main's AbstractSource supplied this; the class was not carried over when HTTP
   * moved into this branch's AbstractSource, whose urlFetchWithRetry throws on
   * non-ok itself. This source drives its own fetch loop, so it needs its own
   * check — and everything downstream reads `statusCode` off the thrown error:
   * _fetchSheetValues refreshes the token on 401, isValidToRetry() retries 429 and
   * 5xx, and _buildSheetRequestErrorMessage() maps 400/403/404 to guidance.
   *
   * @param {Response} response
   * @return {Response} the same response, when it succeeded
   * @throws {HttpRequestException}
   */
  async _validateResponse(response) {
    const code = response.status;

    if (code >= HTTP_STATUS.SUCCESS_MIN && code <= HTTP_STATUS.SUCCESS_MAX) {
      return response;
    }

    const errorInfo = await this._extractErrorInfo(response);
    throw new HttpRequestException({
      message: errorInfo.message,
      statusCode: code,
      payload: errorInfo.json,
    });
  }

  /**
   * Pulls the most specific message an error body offers, falling back to the raw
   * text. Reading the body is what turns a bare "HTTP 400" into Google's own
   * "Unable to parse range: ...".
   *
   * @param {Response} response
   * @return {Promise<{message: string, json: Object|null}>}
   */
  async _extractErrorInfo(response) {
    const text = await response.text();
    let parsedJson = null;
    let message = text;

    try {
      parsedJson = JSON.parse(text);
      message =
        parsedJson?.error?.message ||
        parsedJson?.message ||
        parsedJson?.errorMessage ||
        parsedJson?.error_message ||
        (Array.isArray(parsedJson?.errors) && parsedJson.errors[0]?.message) ||
        text;
    } catch (_) {
      // Not JSON (an HTML error page, an empty body): the raw text is already the
      // best message available, and a parse failure must not mask the HTTP status.
    }

    return { message, json: parsedJson };
  }

  async _delayWithAbort(delay, signal) {
    if (!signal) {
      await AsyncUtils.delay(delay);
      return;
    }

    signal.throwIfAborted();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      const onAbort = () => {
        clearTimeout(timeout);
        reject(signal.reason || new Error('Google Sheets request was aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  _getRetryAfterMs(response) {
    // Headers.get() is already case-insensitive, which is what the manual
    // lower-cased scan over a plain headers object used to provide.
    const retryAfterValue = response?.headers?.get?.('retry-after');
    if (retryAfterValue == null) {
      return null;
    }

    const retryAfter = String(retryAfterValue).trim();
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();

    if (!Number.isFinite(delay)) {
      return null;
    }

    return Math.min(Math.max(0, delay), GOOGLE_SHEETS_MAX_RETRY_AFTER_MS);
  }

  _buildSheetSnapshot(values, applySelectedFields, options = {}) {
    const headerRowNumber = this._getHeaderRowNumber();

    const rangeBounds = this._getConfiguredRangeBounds();
    if (headerRowNumber < rangeBounds.startRow) {
      throw new ConnectorConfigurationException(
        `Header Row ${headerRowNumber} is before the configured range, which starts at row ${rangeBounds.startRow}`
      );
    }
    if (rangeBounds.endRow !== null && headerRowNumber > rangeBounds.endRow) {
      throw new ConnectorConfigurationException(
        `Header Row ${headerRowNumber} is after the configured range, which ends at row ${rangeBounds.endRow}`
      );
    }

    const returnedRangeStartRow = options.returnedRangeStartRow ?? rangeBounds.startRow;
    const headerIndex = headerRowNumber - returnedRangeStartRow;
    const headerRow = values[headerIndex] || [];
    const dataRows = values.slice(headerIndex + 1);
    this._assertImportSize(dataRows);
    const columnCount = this._getColumnCount(headerRow, dataRows);
    const detectedColumns = this._buildColumnDefinitions(headerRow, columnCount);

    if (detectedColumns.length === 0) {
      throw new ConnectorConfigurationException(
        `No columns found at header row ${headerRowNumber} of '${this.context.getParameter('SheetName')?.value}'. ` +
          'Check the sheet tab name, optional range, and header row.'
      );
    }

    const columns = applySelectedFields
      ? this._filterColumnsBySelectedFields(detectedColumns)
      : detectedColumns;
    if (columns.length === 0) {
      throw new ConnectorConfigurationException('No columns selected for import');
    }
    this._assertImportColumnCount(columns);

    const firstDataRowNumber = headerRowNumber + 1;
    const rows = this._buildRows(dataRows, columns, firstDataRowNumber, detectedColumns);

    return { columns, rows };
  }

  _assertImportSize(dataRows) {
    if (dataRows.length > GOOGLE_SHEETS_MAX_IMPORT_ROWS) {
      throw new ConnectorConfigurationException(
        `Google Sheets imports currently support up to ${GOOGLE_SHEETS_MAX_IMPORT_ROWS.toLocaleString('en-US')} data rows per sheet. ` +
          `The selected range contains ${dataRows.length.toLocaleString('en-US')} rows. Narrow the Range and try again.`
      );
    }
  }

  _assertImportColumnCount(columns) {
    if (columns.length > GOOGLE_SHEETS_MAX_IMPORT_COLUMNS) {
      throw new ConnectorConfigurationException(
        `Google Sheets imports currently support up to ${GOOGLE_SHEETS_MAX_IMPORT_COLUMNS.toLocaleString('en-US')} sheet columns. ` +
          `The selected range contains ${columns.length.toLocaleString('en-US')} columns. Narrow the Range or select fewer columns and try again.`
      );
    }
  }

  _getColumnCount(headerRow, dataRows) {
    let columnCount = Array.isArray(headerRow) ? headerRow.length : 0;
    for (const row of dataRows) {
      if (Array.isArray(row) && row.length > columnCount) {
        columnCount = row.length;
      }
    }
    return columnCount;
  }

  isValidToRetry(error) {
    return (
      !error?.statusCode ||
      error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN ||
      error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS
    );
  }

  /**
   * Whether another attempt is worth making. This source drives its own fetch
   * loop rather than AbstractSource.fetch() — it needs Retry-After handling and
   * an abort signal — so it carries the attempt-budget check that the base
   * class applies internally.
   *
   * @param {Error} error - the failure being judged
   * @param {number} attempt - 1-based attempt that just failed
   * @param {number} maxAttempts - total attempts allowed
   * @return {boolean}
   */
  _shouldRetry(error, attempt, maxAttempts) {
    if (attempt >= maxAttempts) {
      this.context.log(LOG_LEVEL.INFO, `Maximum retry attempts (${maxAttempts}) reached.`);
      return false;
    }

    const retryable = this.isValidToRetry(error);
    this.context.log(LOG_LEVEL.INFO, `Attempt ${attempt}: isValidToRetry = ${retryable}`);

    return retryable;
  }

  _buildSheetRequestErrorMessage(error) {
    const statusCode = error?.statusCode;
    const message = error instanceof Error ? error.message : String(error);

    if (statusCode === 403) {
      if (this.context.getParameter('AuthType')?.value === 'oauth2') {
        return (
          `Google Sheets access denied: ${message}. ` +
          'Reconnect Google Sheets and choose the spreadsheet with Google Picker.'
        );
      }

      const serviceAccountEmail = this._getConfiguredServiceAccountEmail();
      const accessHint = serviceAccountEmail
        ? ` Share the spreadsheet with ${serviceAccountEmail}, or use OAuth if the sheet should be read from a user account.`
        : ' Share the spreadsheet with the configured service account, or use OAuth if the sheet should be read from a user account.';

      return `Google Sheets access denied: ${message}.${accessHint}`;
    }

    if (statusCode === 404) {
      return `Google Sheets spreadsheet was not found: ${message}. Check the spreadsheet ID or URL.`;
    }

    if (statusCode === 400) {
      return `Google Sheets could not read the selected range: ${message}. Check the sheet tab name and range.`;
    }

    return `Google Sheets request failed: ${message}`;
  }

  _getConfiguredServiceAccountEmail() {
    const authConfig = this.context.getParameter('AuthType')?.items || {};
    const configuredEmail = authConfig.ServiceAccountEmail?.value;
    if (configuredEmail) {
      return configuredEmail;
    }

    try {
      const parsed = JSON.parse(authConfig.ServiceAccountKey?.value || '{}');
      return typeof parsed.client_email === 'string' ? parsed.client_email : null;
    } catch (_) {
      return null;
    }
  }

  _buildPlaceholderFieldsSchema() {
    return {
      sheet: {
        overview: 'Google Sheets sheet tab',
        description: 'Imports one Google Sheets tab into a warehouse table',
        documentation:
          'The connector infers fields from the selected sheet header row during each refresh.',
        destinationName: 'google_sheets',
        // Routes this node through AbstractConnector.processFullRefreshNode:
        // a sheet's rows and columns can disappear between runs, and only a
        // snapshot replacement removes them downstream too.
        isFullRefresh: true,
        uniqueKeys: ['_owox_row_number'],
        defaultFields: ['_owox_row_number'],
        fields: {
          _owox_row_number: {
            type: DATA_TYPES.INTEGER,
            description: 'Source sheet row number',
          },
          _owox_imported_at: {
            type: DATA_TYPES.TIMESTAMP,
            description: 'Timestamp when OWOX imported the sheet row',
          },
        },
      },
    };
  }

  _setDynamicFieldsSchema(fields) {
    this.fieldsSchema = this._buildFieldsSchema(fields);
  }

  _buildFieldsSchema(fields) {
    return {
      sheet: {
        ...this._buildPlaceholderFieldsSchema().sheet,
        fields,
        uniqueKeys: ['_owox_row_number'],
        defaultFields: Object.keys(fields),
      },
    };
  }

  _extractSpreadsheetId(value) {
    const rawValue = String(value || '').trim();
    // Absent is reported separately from malformed: the option lookup behind the SheetName
    // picker runs BEFORE the configuration as a whole is validated, so an empty spreadsheet
    // field is the ordinary state of a half-filled form, not a typo the user has to hunt for.
    if (rawValue === '') {
      throw new ConnectorConfigurationException('Spreadsheet ID or URL is required');
    }
    const match = rawValue.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
    const spreadsheetId = match ? match[1] : rawValue;

    if (!/^[A-Za-z0-9_-]+$/.test(spreadsheetId)) {
      throw new ConnectorConfigurationException('Spreadsheet ID or URL is invalid');
    }

    return spreadsheetId;
  }

  _buildA1Range({ preview = false } = {}) {
    const configuredRange = String(this.context.getParameter('Range')?.value || '').trim();
    const gridRange = this._getConfiguredGridRange(configuredRange);
    const sheetPrefix = `${this._quoteSheetName(this.context.getParameter('SheetName')?.value)}!`;
    const bounds = this._getRangeBounds(gridRange);
    const headerRow = this._getHeaderRowNumber();
    this._validateHeaderWithinRange(headerRow, bounds);

    if (!preview) {
      const startColumn = bounds.startColumn || 1;
      const endColumn = bounds.endColumn || this._columnLettersToNumber('ZZZ');

      return (
        `${sheetPrefix}${this._columnNumberToLetters(startColumn)}${bounds.startRow}:` +
        `${this._columnNumberToLetters(endColumn)}${bounds.endRow || ''}`
      );
    }

    const startColumn = bounds.startColumn || 1;
    const endColumn = Math.min(
      bounds.endColumn || startColumn + GOOGLE_SHEETS_MAX_IMPORT_COLUMNS - 1,
      startColumn + GOOGLE_SHEETS_MAX_IMPORT_COLUMNS - 1
    );
    const endRow = Math.min(
      bounds.endRow || headerRow + GOOGLE_SHEETS_PREVIEW_SAMPLE_ROWS,
      headerRow + GOOGLE_SHEETS_PREVIEW_SAMPLE_ROWS
    );

    return (
      `${sheetPrefix}${this._columnNumberToLetters(startColumn)}${headerRow}:` +
      `${this._columnNumberToLetters(endColumn)}${endRow}`
    );
  }

  _quoteSheetName(sheetName) {
    return `'${String(sheetName).replace(/'/g, "''")}'`;
  }

  _getHeaderRowNumber() {
    const headerRowNumber = Number(this.context.getParameter('HeaderRow')?.value);
    if (!Number.isInteger(headerRowNumber) || headerRowNumber < 1) {
      throw new ConnectorConfigurationException(
        'Header Row must be a whole number greater than or equal to 1'
      );
    }
    return headerRowNumber;
  }

  _getConfiguredRangeBounds() {
    const configuredRange = String(this.context.getParameter('Range')?.value || '').trim();
    const gridRange = this._getConfiguredGridRange(configuredRange);

    return this._getRangeBounds(gridRange);
  }

  _getRangeBounds(gridRange) {
    const bounds = this._parseA1GridRange(gridRange);
    if (gridRange && !bounds) {
      throw new ConnectorConfigurationException(
        'Range must use A1 notation, for example A:D or B5:D20'
      );
    }

    return (
      bounds || {
        startColumn: 1,
        endColumn: null,
        startRow: 1,
        endRow: null,
      }
    );
  }

  _getConfiguredGridRange(configuredRange) {
    const separatorIndex = configuredRange.lastIndexOf('!');
    if (separatorIndex < 0) {
      return configuredRange;
    }

    const rangeSheetName = configuredRange
      .slice(0, separatorIndex)
      .replace(/^'(.*)'$/, '$1')
      .replace(/''/g, "'");
    const selectedSheetName = String(this.context.getParameter('SheetName')?.value);
    if (rangeSheetName !== selectedSheetName) {
      throw new ConnectorConfigurationException(
        `Range must use the selected sheet '${selectedSheetName}', not '${rangeSheetName}'`
      );
    }

    return configuredRange.slice(separatorIndex + 1);
  }

  _parseA1GridRange(gridRange) {
    const value = String(gridRange || '')
      .trim()
      .replace(/\$/g, '');
    if (!value) {
      return null;
    }

    const cellRangeMatch = value.match(/^([A-Za-z]{1,3})(\d*)?(?::([A-Za-z]{1,3})(\d*)?)?$/);
    if (cellRangeMatch) {
      const hasEnd = cellRangeMatch[3] !== undefined;
      const startRow = cellRangeMatch[2] ? Number(cellRangeMatch[2]) : 1;
      const endRow = hasEnd && cellRangeMatch[4] ? Number(cellRangeMatch[4]) : null;
      return {
        startColumn: this._columnLettersToNumber(cellRangeMatch[1]),
        endColumn: hasEnd
          ? this._columnLettersToNumber(cellRangeMatch[3])
          : this._columnLettersToNumber(cellRangeMatch[1]),
        startRow,
        endRow: hasEnd ? endRow : cellRangeMatch[2] ? startRow : null,
      };
    }

    const rowRangeMatch = value.match(/^(\d+):(\d+)$/);
    if (rowRangeMatch) {
      return {
        startColumn: 1,
        endColumn: null,
        startRow: Number(rowRangeMatch[1]),
        endRow: Number(rowRangeMatch[2]),
      };
    }

    return null;
  }

  _columnLettersToNumber(letters) {
    return String(letters)
      .toUpperCase()
      .split('')
      .reduce((columnNumber, character) => columnNumber * 26 + character.charCodeAt(0) - 64, 0);
  }

  _columnNumberToLetters(columnNumber) {
    let value = columnNumber;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - 1) / 26);
    }
    return letters;
  }

  _validateHeaderWithinRange(headerRow, bounds) {
    if (headerRow < bounds.startRow) {
      throw new ConnectorConfigurationException(
        `Header Row ${headerRow} is before the configured range, which starts at row ${bounds.startRow}`
      );
    }
    if (bounds.endRow !== null && headerRow > bounds.endRow) {
      throw new ConnectorConfigurationException(
        `Header Row ${headerRow} is after the configured range, which ends at row ${bounds.endRow}`
      );
    }
  }

  _buildColumnDefinitions(headerRow, columnCount = headerRow.length) {
    const usedNames = new Set();
    const reservedNames = new Set([
      '_owox_row_number',
      '_owox_imported_at',
      'owox_row_number',
      'owox_imported_at',
    ]);

    return Array.from({ length: columnCount }, (_, index) => {
      const header = headerRow[index];
      const originalName = header === undefined || header === null ? '' : String(header).trim();
      const fallbackName = `column_${index + 1}`;
      let normalizedName = this._normalizeColumnName(originalName || fallbackName);

      if (reservedNames.has(normalizedName)) {
        normalizedName = `sheet_${normalizedName.replace(/^_+/, '')}`;
      }

      const uniqueName = this._deduplicateColumnName(normalizedName, usedNames);
      return {
        originalName,
        name: uniqueName,
        index,
        generated: !originalName,
      };
    }).filter(column => column.name);
  }

  _filterColumnsBySelectedFields(columns) {
    if (this._importsAllColumns()) {
      return columns;
    }

    const selectedFields = this._getSelectedSheetFieldNames();

    if (selectedFields.length === 0) {
      throw new ConnectorConfigurationException('No columns selected for import');
    }

    const matchedColumnNames = new Set();
    const missingFields = [];

    for (const selectedField of selectedFields) {
      const normalizedSelectedField = this._normalizeMatchValue(selectedField);
      const exactMatch = columns.find(
        column => this._normalizeMatchValue(column.name) === normalizedSelectedField
      );
      if (exactMatch) {
        matchedColumnNames.add(exactMatch.name);
        continue;
      }

      const aliasMatches = columns.filter(column =>
        this._getColumnAliasMatchKeys(column).includes(normalizedSelectedField)
      );
      if (aliasMatches.length === 1) {
        matchedColumnNames.add(aliasMatches[0].name);
      } else {
        missingFields.push(selectedField);
      }
    }

    const matchedColumns = columns.filter(column => matchedColumnNames.has(column.name));

    if (matchedColumns.length === 0) {
      const availableColumns = this._formatAvailableColumns(columns);
      throw new ConnectorConfigurationException(
        `None of the selected columns were found in the sheet: ${selectedFields.join(', ')}. ` +
          `Available columns: ${availableColumns}`
      );
    }

    if (missingFields.length) {
      const availableColumns = this._formatAvailableColumns(columns);
      this.context.log(
        LOG_LEVEL.INFO,
        `Warning: selected columns no longer found in the sheet and will be skipped: ` +
          `${missingFields.join(', ')}. Available columns: ${availableColumns}`
      );
    }

    return matchedColumns;
  }

  _formatAvailableColumns(columns) {
    return columns.map(column => column.originalName || column.name).join(', ');
  }

  _getSelectedSheetFieldNames() {
    const fieldsValue = this.context.getParameter('Fields')?.value;
    if (!fieldsValue) {
      return [];
    }

    return String(fieldsValue)
      .split(',')
      .map(field => field.trim())
      .filter(Boolean)
      .map(field => field.split(/\s+/))
      .filter(fieldParts => fieldParts.length === 2 && fieldParts[0] === 'sheet')
      .map(([, fieldName]) => fieldName)
      .filter(fieldName => fieldName !== '*')
      .filter(fieldName => !this._isTechnicalField(fieldName));
  }

  _importsAllColumns() {
    const value = this.context.getParameter('ImportAllColumns')?.value;

    // Older persisted configurations and external callers can represent booleans
    // as SQLite-style numbers or strings. Treat every explicit false value as subset mode.
    return value !== false && value !== 0 && value !== 'false' && value !== '0';
  }

  _getColumnAliasMatchKeys(column) {
    return [column.originalName, this._normalizeColumnName(column.originalName || '')]
      .filter(Boolean)
      .map(value => this._normalizeMatchValue(value));
  }

  _normalizeMatchValue(value) {
    return String(value).trim().toLowerCase();
  }

  _isTechnicalField(fieldName) {
    return fieldName === '_owox_row_number' || fieldName === '_owox_imported_at';
  }

  _normalizeColumnName(value) {
    let name = String(value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!name) {
      name = 'column';
    }

    if (!/^[a-z_]/.test(name)) {
      name = `column_${name}`;
    }

    return name.slice(0, GOOGLE_SHEETS_MAX_IDENTIFIER_BYTES);
  }

  _deduplicateColumnName(name, usedNames) {
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }

    let suffixNumber = 2;
    let candidate;
    do {
      const suffix = `_${suffixNumber}`;
      const base = name.slice(0, GOOGLE_SHEETS_MAX_IDENTIFIER_BYTES - suffix.length);
      candidate = `${base}${suffix}`;
      suffixNumber += 1;
    } while (usedNames.has(candidate));

    usedNames.add(candidate);
    return candidate;
  }

  _buildRows(dataRows, columns, firstDataRowNumber, rowPresenceColumns = columns) {
    const importedAt = this._formatWarehouseTimestamp(new Date());
    const includeImportedAt = this._shouldIncludeImportedAt();

    return dataRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        rowPresenceColumns.some(column => this._normalizeCellValue(row[column.index]) !== null)
      )
      .map(({ row, index }) => {
        const normalizedRow = {
          _owox_row_number: firstDataRowNumber + index,
        };
        if (includeImportedAt) {
          normalizedRow._owox_imported_at = importedAt;
        }

        columns.forEach(column => {
          normalizedRow[column.name] = this._normalizeCellValue(row[column.index]);
        });

        return normalizedRow;
      });
  }

  _formatWarehouseTimestamp(value) {
    return value.toISOString().replace('T', ' ').replace('Z', '');
  }

  _normalizeCellValue(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return value;
  }

  /**
   * Imports sheet columns of dates as DATE, changing the snapshot rows in place.
   *
   * The Data Mart Output Schema decides, so that a Data Mart that already imports a column as
   * text keeps doing so until someone asks for a date:
   * - Output Schema says DATE: the column is DATE. A cell that is a date in the sheet (formatted
   *   as Date or Date time) becomes its calendar day; any other filled cell becomes empty, and the
   *   run log lists those rows, so one stray value cannot turn a date column back into text. Only
   *   a column with no date at all is imported as before: it is not a date column (any more).
   * - Output Schema has no type for the column (a new Data Mart before its first run, a column
   *   added to the sheet later, or a run outside OWOX Data Marts) and unlisted columns are
   *   inferred: the column becomes DATE when Infer Types is on and every filled cell is a date
   *   formatted as Date. Otherwise it is imported as before.
   * - Output Schema says any other type: the column is imported exactly as before.
   *
   * The cell formats and serials come from a second read. Each cell's displayed text must match
   * the values read; a difference means the sheet changed in between. Warnings are written to
   * the run log only for an attempt that is kept, never for one the caller reads again.
   *
   * @param {{columns: Array<Object>, rows: Array<Object>}} snapshot
   * @param {Object} [options]
   * @param {AbortSignal} [options.signal]
   * @param {boolean} [options.acceptSheetChanges] - Take the dates from the second read even when
   *   it disagrees with the values read, instead of stopping so the caller can read again
   * @returns {Promise<{columnTypes: Object<string, string>, sheetChanged: boolean}>} Column name to
   *   DATA_TYPES.DATE for every column imported as DATE, and whether the two reads disagreed
   */
  async _convertDateColumns({ columns, rows }, { signal, acceptSheetChanges } = {}) {
    const outputSchemaTypes = this._getOutputSchemaFieldTypes();
    if (!outputSchemaTypes) {
      return { columnTypes: {}, sheetChanged: false };
    }

    const inferUnlisted =
      outputSchemaTypes.inferUnlisted && Boolean(this.context.getParameter('InferTypes')?.value);
    const targets = [];
    for (const column of columns) {
      const declaredType = outputSchemaTypes.fields[column.name];
      const declared = declaredType === GOOGLE_SHEETS_OUTPUT_SCHEMA_DATE;
      if (!declared && !(declaredType === undefined && inferUnlisted)) {
        continue;
      }

      const filledRows = rows.filter(row => row[column.name] !== null);
      // A date arrives from the values read as text; a number or a boolean never is one.
      if (
        declared ||
        (filledRows.length > 0 && filledRows.every(row => typeof row[column.name] === 'string'))
      ) {
        targets.push({ column, filledRows, declared });
      }
    }

    const inferred = await this._selectDateLikeColumns(
      targets.filter(target => !target.declared),
      signal
    );
    const columnTypes = {};
    const toRead = [];
    for (const target of [...targets.filter(target => target.declared), ...inferred]) {
      if (target.filledRows.length > 0) {
        toRead.push(target);
      } else {
        // Only a declared column can be empty here, and it keeps its DATE type.
        columnTypes[target.column.name] = DATA_TYPES.DATE;
      }
    }

    const lastRowNumber = rows.length > 0 ? rows[rows.length - 1]._owox_row_number : 0;
    const warnings = [];
    let sheetChanged = false;
    for (const batch of this._planDateColumnReads(toRead, lastRowNumber)) {
      // Each request is converted as soon as it arrives, so only its cells are held at a time.
      const cellsByColumn = await this._fetchDateColumnCells(batch, { signal });
      for (const target of batch.targets) {
        const result = this._convertDateColumn(target, cellsByColumn.get(target.column.index), {
          acceptSheetChanges,
        });
        if (result.sheetChanged && !acceptSheetChanges) {
          // The caller reads the sheet again, so this attempt is dropped with its warnings.
          return { columnTypes: {}, sheetChanged: true };
        }
        sheetChanged = sheetChanged || result.sheetChanged;
        warnings.push(...result.warnings);
        if (result.isDate) {
          columnTypes[target.column.name] = DATA_TYPES.DATE;
        }
      }
    }

    if (sheetChanged) {
      warnings.push(
        'The sheet changed while it was being read, so date columns were taken from the latest ' +
          'read. If rows were moved or inserted during the import, run it again.'
      );
    }
    warnings.forEach(message => this.context.log(LOG_LEVEL.WARN, message));
    return { columnTypes, sheetChanged };
  }

  /**
   * Reads the Output Schema type classes the backend passes for this run.
   *
   * @returns {{fields: Object<string, string>, inferUnlisted: boolean}|null} Field name to class,
   *   and whether columns the Output Schema does not list are inferred. With no value at all
   *   (no Output Schema yet, or a run outside OWOX Data Marts) every column is unlisted and
   *   inferred. Null when the value cannot be read: then no column is converted, because guessing
   *   could change a column that the Output Schema keeps as text.
   */
  _getOutputSchemaFieldTypes() {
    const rawValue = this.context.getParameter('OutputSchemaFieldTypes')?.value;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      return { fields: Object.create(null), inferUnlisted: true };
    }

    try {
      const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
      const fields = parsed?.fields;
      if (fields && typeof fields === 'object' && !Array.isArray(fields)) {
        return {
          fields: Object.assign(Object.create(null), fields),
          inferUnlisted: parsed.unlistedColumns !== 'KEEP',
        };
      }
    } catch (_) {
      // Reported below, together with a value of the wrong shape.
    }

    this.context.log(
      LOG_LEVEL.WARN,
      'Could not read the Output Schema field types for this run; no column is imported as a date'
    );
    return null;
  }

  /**
   * Keeps the inference candidates whose cells in the preview sample are all formatted as Date.
   * A cheap first pass: one small request for all candidates, so that only likely date columns
   * are read cell by cell.
   */
  async _selectDateLikeColumns(candidates, signal) {
    if (candidates.length === 0) {
      return [];
    }

    const formatTypeAt = await this._fetchSampleNumberFormatTypes(signal);
    const lastSampleRowNumber = this._getHeaderRowNumber() + GOOGLE_SHEETS_PREVIEW_SAMPLE_ROWS;
    return candidates.filter(({ column, filledRows }) => {
      const sampledRows = filledRows.filter(row => row._owox_row_number <= lastSampleRowNumber);
      return (
        sampledRows.length > 0 &&
        sampledRows.every(row => formatTypeAt(row._owox_row_number, column.index) === 'DATE')
      );
    });
  }

  /**
   * Converts one column, in place, from its cells in the date-column read.
   *
   * A column the Output Schema declares as DATE takes the day of every Date and Date time cell
   * and empties the other cells; it stays text only when none of its cells is a date. An
   * inferred column converts only when every filled cell is a date formatted as Date.
   *
   * @param {{column: Object, filledRows: Array<Object>, declared: boolean}} target - A column
   *   with at least one filled cell
   * @param {Map<number, Object>} [cells] - Its cells from _fetchDateColumnCells
   * @returns {{isDate: boolean, sheetChanged: boolean, warnings: string[]}} The warnings are for
   *   the run log, and are written only when the attempt is kept
   */
  _convertDateColumn({ column, filledRows, declared }, cells, { acceptSheetChanges }) {
    let sheetChanged = false;
    const dates = [];
    const notDateRowNumbers = [];
    for (const row of filledRows) {
      const cell = cells?.get(row._owox_row_number);
      const sheetValue = row[column.name];
      if (typeof sheetValue === 'string' && cell?.formattedValue !== sheetValue) {
        sheetChanged = true;
        if (!acceptSheetChanges) {
          return { isDate: false, sheetChanged, warnings: [] };
        }
      }

      const isDateCell = declared
        ? GOOGLE_SHEETS_DATE_CELL_FORMATS.has(cell?.formatType)
        : cell?.formatType === 'DATE';
      const date = isDateCell ? this._serialToDate(cell.serial) : null;
      if (date === null) {
        if (!declared) {
          return { isDate: false, sheetChanged, warnings: [] };
        }
        notDateRowNumbers.push(row._owox_row_number);
      }
      dates.push(date);
    }

    if (notDateRowNumbers.length === filledRows.length) {
      return {
        isDate: false,
        sheetChanged,
        warnings: [this._describeNoDatesInDeclaredColumn(column)],
      };
    }

    filledRows.forEach((row, index) => {
      row[column.name] = dates[index];
    });
    return {
      isDate: true,
      sheetChanged,
      warnings:
        notDateRowNumbers.length > 0
          ? [this._describeCellsImportedEmpty(column, notDateRowNumbers)]
          : [],
    };
  }

  /**
   * Converts a Google Sheets date serial to its calendar day, `YYYY-MM-DD`. A serial with a time
   * of day keeps the day the cell shows.
   *
   * @returns {string|null} Null when the value is not a serial or falls outside year 1-9999
   */
  _serialToDate(serial) {
    if (typeof serial !== 'number' || !Number.isFinite(serial)) {
      return null;
    }

    // Rounded to the millisecond first: time arithmetic in a sheet can leave midnight a hair
    // short, such as 46296.99999999999, which still shows the next day.
    const milliseconds = Math.round(serial * GOOGLE_SHEETS_MS_PER_DAY);
    const date = new Date(
      GOOGLE_SHEETS_SERIAL_EPOCH_MS +
        Math.floor(milliseconds / GOOGLE_SHEETS_MS_PER_DAY) * GOOGLE_SHEETS_MS_PER_DAY
    );
    // An out-of-range timestamp gives an invalid Date, whose year is NaN.
    const year = date.getUTCFullYear();
    if (Number.isNaN(year) || year < 1 || year > 9999) {
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  /**
   * Run-log warnings for a column the Output Schema declares as DATE. They name rows, never
   * cell contents: the run log is kept and shown to every viewer of the Data Mart.
   */
  _describeCellsImportedEmpty(column, rowNumbers) {
    const listed = rowNumbers.slice(0, GOOGLE_SHEETS_MAX_LOGGED_ROWS).join(', ');
    const more =
      rowNumbers.length > GOOGLE_SHEETS_MAX_LOGGED_ROWS
        ? ` and ${rowNumbers.length - GOOGLE_SHEETS_MAX_LOGGED_ROWS} more`
        : '';
    const finding =
      rowNumbers.length === 1
        ? `row ${listed} is not a date in the sheet, so it was imported as an empty value`
        : `rows ${listed}${more} are not dates in the sheet, so they were imported as empty values`;
    return (
      `Column '${this._getColumnLabel(column)}' is DATE in the Output Schema, but ${finding}. ` +
      'Enter dates in those cells, or change the field type in the Output Schema.'
    );
  }

  _describeNoDatesInDeclaredColumn(column) {
    return (
      `Column '${this._getColumnLabel(column)}' is DATE in the Output Schema, but none of its ` +
      'cells is a date in the sheet, so it was not imported as a date. Format the cells as ' +
      'dates, then check that the field is still DATE in the Output Schema: storages other ' +
      'than BigQuery take the field type from the table.'
    );
  }

  _getColumnLabel(column) {
    return column.originalName || column.name;
  }

  _inferSchema(columns, rows, options = {}) {
    const fields = {
      _owox_row_number: {
        type: DATA_TYPES.INTEGER,
        description: 'Source sheet row number',
      },
    };
    if (options.includeImportedAt || this._shouldIncludeImportedAt()) {
      fields._owox_imported_at = {
        type: DATA_TYPES.TIMESTAMP,
        description: 'Timestamp when OWOX imported the sheet row',
      };
    }

    for (const column of columns) {
      const values = rows
        .map(row => row[column.name])
        .filter(value => value !== null && value !== undefined);
      // Set by _convertDateColumns, whose values are ISO text that _inferType would call STRING.
      const convertedDateType = options.columnTypes?.[column.name];

      fields[column.name] = {
        type:
          convertedDateType ??
          (this.context.getParameter('InferTypes')?.value
            ? this._inferType(values)
            : DATA_TYPES.STRING),
        description: this._buildFieldDescription(column),
      };
    }

    return fields;
  }

  _shouldIncludeImportedAt() {
    return this._getConfiguredFieldNames().includes('_owox_imported_at');
  }

  _getConfiguredFieldNames() {
    const fieldsValue = this.context.getParameter('Fields')?.value;
    if (!fieldsValue) {
      return [];
    }

    return String(fieldsValue)
      .split(',')
      .map(field => field.trim().split(/\s+/))
      .filter(fieldParts => fieldParts.length === 2 && fieldParts[0] === 'sheet')
      .map(([, fieldName]) => fieldName);
  }

  _buildFieldDescription(column) {
    if (column.generated) {
      return `Google Sheets generated column ${column.index + 1}`;
    }

    const originalName = column.originalName || `Blank header at column ${column.index + 1}`;
    return `Google Sheets column: ${String(originalName)
      .replace(/"/g, "'")
      .replace(/[\r\n]+/g, ' ')}`;
  }

  _inferType(values) {
    if (!values.length) {
      return DATA_TYPES.STRING;
    }

    if (values.every(value => this._isBoolean(value))) {
      return DATA_TYPES.BOOLEAN;
    }

    if (values.every(value => this._isInteger(value))) {
      return DATA_TYPES.INTEGER;
    }

    if (values.every(value => this._isNumber(value))) {
      return DATA_TYPES.NUMBER;
    }

    return DATA_TYPES.STRING;
  }

  _isBoolean(value) {
    return typeof value === 'boolean';
  }

  _isInteger(value) {
    return typeof value === 'number' && Number.isSafeInteger(value);
  }

  _isNumber(value) {
    return (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      Math.abs(value) <= Number.MAX_SAFE_INTEGER
    );
  }
}
