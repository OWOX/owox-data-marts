/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

var GOOGLE_SHEETS_MAX_IDENTIFIER_BYTES = 127;
var GOOGLE_SHEETS_PREVIEW_MAX_COLUMNS = 256;
var GOOGLE_SHEETS_PREVIEW_SAMPLE_ROWS = 100;
var GOOGLE_SHEETS_MAX_RETRY_AFTER_MS = 300000;

var GoogleSheetsSource = class GoogleSheetsSource extends AbstractSource {
  constructor(config) {
    super(
      config.mergeParameters({
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
          description: 'Name of the sheet tab to import. One Data Mart imports one sheet tab.',
        },
        Range: {
          requiredType: 'string',
          default: '',
          label: 'Range',
          description:
            'Optional A1 range inside the selected sheet, for example A:D. Leave empty to import the used range.',
        },
        HeaderRow: {
          isRequired: true,
          requiredType: 'number',
          default: 1,
          minimum: 1,
          label: 'Header Row',
          description:
            'One-based row number containing column names. The rows below it are imported as data.',
        },
        InferTypes: {
          requiredType: 'boolean',
          default: true,
          label: 'Infer Types',
          description:
            'Infer warehouse column types from sheet values. Mixed columns fall back to STRING.',
          attributes: [CONFIG_ATTRIBUTES.ADVANCED],
        },
        ImportAllColumns: {
          requiredType: 'boolean',
          default: true,
          label: 'Import All Columns',
          description:
            'Import every current sheet column, including columns added after setup. Disable to use the explicit Fields selection.',
          attributes: [CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
        },
        SelectedColumns: {
          requiredType: 'string',
          default: '',
          label: 'Selected Columns',
          description:
            'Persisted user column selection. Missing columns are removed after a successful refresh.',
          attributes: [CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
        },
        Fields: {
          requiredType: 'string',
          default: 'sheet _owox_row_number',
          label: 'Fields',
          description: 'Generated at runtime from the selected sheet headers',
          attributes: [CONFIG_ATTRIBUTES.HIDE_IN_CONFIG_FORM],
        },
      })
    );

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

      const response = await HttpUtils.fetch(tokenUrl, {
        method: 'post',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: Object.entries(payload)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&'),
      });
      const data = await response.getAsJson();

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

      let userData = { id: 'unknown', name: null };
      try {
        const userResponse = await HttpUtils.fetch(
          'https://www.googleapis.com/oauth2/v2/userinfo',
          { headers: { Authorization: `Bearer ${data.access_token}` } }
        );
        const userInfo = await userResponse.getAsJson();
        if (userInfo.id) {
          userData = { id: userInfo.id, name: userInfo.email };
        }
      } catch (_) {
        // User info is only display metadata; the Sheets token is enough to run.
      }

      return OauthCredentialsDto.builder()
        .withUser(userData)
        .withSecret({
          refresh_token: data.refresh_token,
          access_token: data.access_token,
          client_id: variables.ClientId,
          client_secret: variables.ClientSecret,
        })
        .withExpiresIn(data.expires_in ?? 3600)
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

  async getAccessToken({ forceRefresh = false, signal } = {}) {
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

    const authType = this.config.AuthType?.value;
    if (!authType) {
      throw new Error('AuthType not configured');
    }

    const authConfig = this.config.AuthType.items;
    if (authType === 'oauth2') {
      this.accessToken = await OAuthUtils.getAccessToken({
        config: this.config,
        tokenUrl: 'https://oauth2.googleapis.com/token',
        formData: {
          grant_type: 'refresh_token',
          client_id: authConfig.ClientId.value,
          client_secret: authConfig.ClientSecret.value,
          refresh_token: authConfig.RefreshToken.value,
        },
        signal,
      });
    } else if (authType === 'service_account') {
      this.accessToken = await OAuthUtils.getServiceAccountToken({
        config: this.config,
        tokenUrl: 'https://oauth2.googleapis.com/token',
        serviceAccountKeyJson: authConfig.ServiceAccountKey.value,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
        signal,
      });
    } else {
      throw new Error(`Unsupported Google Sheets authentication type: ${authType}`);
    }
    this.tokenExpiryTime = Date.now() + (3600 - 60) * 1000;

    return this.accessToken;
  }

  async fetchData() {
    const values = await this._fetchSheetValues();
    const { columns, rows } = this._buildSheetSnapshot(values, true);
    const schema = this._inferSchema(columns, rows);
    this._setDynamicFieldsSchema(schema);

    return rows;
  }

  async fetchFieldsSchema(signal) {
    const values = await this._fetchSheetValues({ preview: true, signal });
    const { columns, rows } = this._buildSheetSnapshot(values, false, {
      returnedRangeStartRow: this._getHeaderRowNumber(),
    });
    const schema = this._inferSchema(columns, rows, { includeImportedAt: true });

    return this._buildFieldsSchema(schema, {
      includeTechnicalFields: true,
      includeTechnicalFieldsInDefaultFields: true,
    });
  }

  async _fetchSheetValues({ preview = false, signal } = {}) {
    const spreadsheetId = this._extractSpreadsheetId(this.config.SpreadsheetId.value);
    const range = this._buildA1Range({ preview });
    const encodedRange = encodeURIComponent(range);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}` +
      '?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

    for (let authorizationAttempt = 0; authorizationAttempt < 2; authorizationAttempt += 1) {
      try {
        signal?.throwIfAborted();
        const accessToken = await this.getAccessToken({
          forceRefresh: authorizationAttempt > 0,
          signal,
        });
        const response = await this._fetchSheetResponse(url, accessToken, signal);
        const payload = await response.getAsJson();
        return Array.isArray(payload.values) ? payload.values : [];
      } catch (error) {
        if (error?.statusCode === HTTP_STATUS.UNAUTHORIZED && authorizationAttempt === 0) {
          this.config.logMessage(
            'Google Sheets access token was rejected; refreshing it and retrying once'
          );
          continue;
        }

        throw new HttpRequestException({
          message: this._buildSheetRequestErrorMessage(error),
          statusCode: error?.statusCode,
          payload: error?.payload,
        });
      }
    }

    return [];
  }

  async _fetchSheetResponse(url, accessToken, signal) {
    for (let attempt = 1; attempt <= this.config.MaxFetchRetries.value; attempt += 1) {
      let response;

      try {
        signal?.throwIfAborted();
        response = await HttpUtils.fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          muteHttpExceptions: true,
          signal,
        });
        return await this._validateResponse(response);
      } catch (error) {
        if (error?.statusCode === HTTP_STATUS.UNAUTHORIZED) {
          throw error;
        }

        if (!this._shouldRetry(error, attempt)) {
          throw error;
        }

        const retryAfterMs = this._getRetryAfterMs(response);
        const delay = retryAfterMs ?? this.calculateBackoff(attempt);
        this.config.logMessage(
          `Retrying Google Sheets request after ${Math.round(delay / 1000)}s`
        );
        await this._delayWithAbort(delay, signal);
      }
    }

    throw new Error('Google Sheets request retry loop ended unexpectedly');
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
    const headers = response?.getHeaders?.() || {};
    const retryAfterEntry = Object.entries(headers).find(
      ([headerName]) => headerName.toLowerCase() === 'retry-after'
    );
    if (!retryAfterEntry) {
      return null;
    }

    const retryAfter = String(retryAfterEntry[1]).trim();
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
      throw new Error(
        `Header Row ${headerRowNumber} is before the configured range, which starts at row ${rangeBounds.startRow}`
      );
    }
    if (rangeBounds.endRow !== null && headerRowNumber > rangeBounds.endRow) {
      throw new Error(
        `Header Row ${headerRowNumber} is after the configured range, which ends at row ${rangeBounds.endRow}`
      );
    }

    const returnedRangeStartRow = options.returnedRangeStartRow ?? rangeBounds.startRow;
    const headerIndex = headerRowNumber - returnedRangeStartRow;
    const headerRow = values[headerIndex] || [];
    const dataRows = values.slice(headerIndex + 1);
    const columnCount = Math.max(
      headerRow.length,
      ...dataRows.map(row => (Array.isArray(row) ? row.length : 0))
    );
    const detectedColumns = this._buildColumnDefinitions(headerRow, columnCount);

    if (detectedColumns.length === 0) {
      throw new Error(
        `No columns found at header row ${headerRowNumber} of '${this.config.SheetName.value}'. ` +
          'Check the sheet tab name, optional range, and header row.'
      );
    }

    const columns = applySelectedFields
      ? this._filterColumnsBySelectedFields(detectedColumns)
      : detectedColumns;
    if (columns.length === 0) {
      throw new Error('No columns selected for import');
    }

    const firstDataRowNumber = headerRowNumber + 1;
    const rows = this._buildRows(dataRows, columns, firstDataRowNumber);

    return { columns, rows };
  }

  isValidToRetry(error) {
    return (
      !error?.statusCode ||
      error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN ||
      error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS
    );
  }

  _buildSheetRequestErrorMessage(error) {
    const statusCode = error?.statusCode;
    const message = error instanceof Error ? error.message : String(error);

    if (statusCode === 403) {
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
    const authConfig = this.config.AuthType?.items || {};
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

  _buildFieldsSchema(fields, options = {}) {
    const includeTechnicalFields = options.includeTechnicalFields !== false;
    const includeTechnicalFieldsInDefaultFields =
      options.includeTechnicalFieldsInDefaultFields !== false;
    const includeUniqueKeys = options.includeUniqueKeys !== false;
    const visibleFields = includeTechnicalFields
      ? fields
      : Object.fromEntries(
          Object.entries(fields).filter(([fieldName]) => !this._isTechnicalField(fieldName))
        );
    const defaultFields = Object.keys(visibleFields).filter(fieldName => {
      return includeTechnicalFieldsInDefaultFields || !this._isTechnicalField(fieldName);
    });

    return {
      sheet: {
        ...this._buildPlaceholderFieldsSchema().sheet,
        fields: visibleFields,
        uniqueKeys: includeUniqueKeys ? ['_owox_row_number'] : [],
        defaultFields,
      },
    };
  }

  _extractSpreadsheetId(value) {
    const rawValue = String(value || '').trim();
    const match = rawValue.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : rawValue;
  }

  _buildA1Range({ preview = false } = {}) {
    const configuredRange = String(this.config.Range?.value || '').trim();
    const gridRange = this._getConfiguredGridRange(configuredRange);
    const sheetPrefix = `${this._quoteSheetName(this.config.SheetName.value)}!`;

    if (!preview) {
      return gridRange ? `${sheetPrefix}${gridRange}` : sheetPrefix.slice(0, -1);
    }

    const parsedBounds = this._parseA1GridRange(gridRange);
    if (gridRange && !parsedBounds) {
      return `${sheetPrefix}${gridRange}`;
    }

    const bounds = parsedBounds || {
      startColumn: 1,
      endColumn: null,
      startRow: 1,
      endRow: null,
    };
    const headerRow = this._getHeaderRowNumber();
    this._validateHeaderWithinRange(headerRow, bounds);

    const startColumn = bounds.startColumn || 1;
    const endColumn = Math.min(
      bounds.endColumn || startColumn + GOOGLE_SHEETS_PREVIEW_MAX_COLUMNS - 1,
      startColumn + GOOGLE_SHEETS_PREVIEW_MAX_COLUMNS - 1
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
    const headerRowNumber = Number(this.config.HeaderRow.value);
    if (!Number.isInteger(headerRowNumber) || headerRowNumber < 1) {
      throw new Error('Header Row must be a whole number greater than or equal to 1');
    }
    return headerRowNumber;
  }

  _getConfiguredRangeBounds() {
    const configuredRange = String(this.config.Range?.value || '').trim();
    const gridRange = this._getConfiguredGridRange(configuredRange);

    return (
      this._parseA1GridRange(gridRange) || {
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
    const selectedSheetName = String(this.config.SheetName.value);
    if (rangeSheetName !== selectedSheetName) {
      throw new Error(
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
      throw new Error(
        `Header Row ${headerRow} is before the configured range, which starts at row ${bounds.startRow}`
      );
    }
    if (bounds.endRow !== null && headerRow > bounds.endRow) {
      throw new Error(
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
      throw new Error('No columns selected for import');
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
      throw new Error(
        `None of the selected columns were found in the sheet: ${selectedFields.join(', ')}. ` +
          `Available columns: ${availableColumns}`
      );
    }

    if (missingFields.length) {
      const availableColumns = this._formatAvailableColumns(columns);
      this.config.logMessage(
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
    const selectedColumnsValue = this.config.SelectedColumns?.value;
    if (selectedColumnsValue) {
      return String(selectedColumnsValue)
        .split(',')
        .map(field => field.trim())
        .filter(Boolean)
        .filter(fieldName => !this._isTechnicalField(fieldName));
    }

    const fieldsValue = this.config.Fields?.value;
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
    const value = this.config.ImportAllColumns?.value;

    // Older persisted configurations and external callers can represent booleans
    // as SQLite-style numbers or strings. Treat every explicit false value as subset mode.
    return value !== false && value !== 0 && value !== 'false' && value !== '0';
  }

  _getColumnAliasMatchKeys(column) {
    return [
      column.originalName,
      this._normalizeColumnName(column.originalName || ''),
    ]
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

  _buildRows(dataRows, columns, firstDataRowNumber) {
    const importedAt = new Date().toISOString();
    const includeImportedAt = this._shouldIncludeImportedAt();

    return dataRows
      .map((row, index) => {
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
      })
      .filter(row => columns.some(column => row[column.name] !== null));
  }

  _normalizeCellValue(value) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return value;
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

      fields[column.name] = {
        type: this.config.InferTypes.value ? this._inferType(values) : DATA_TYPES.STRING,
        description: this._buildFieldDescription(column),
      };
    }

    return fields;
  }

  _shouldIncludeImportedAt() {
    return this._getConfiguredFieldNames().includes('_owox_imported_at');
  }

  _getConfiguredFieldNames() {
    const selectedColumnsValue = this.config.SelectedColumns?.value;
    if (selectedColumnsValue) {
      return String(selectedColumnsValue)
        .split(',')
        .map(field => field.trim())
        .filter(Boolean);
    }

    const fieldsValue = this.config.Fields?.value;
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
    return typeof value === 'number' && Number.isInteger(value);
  }

  _isNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }
};
