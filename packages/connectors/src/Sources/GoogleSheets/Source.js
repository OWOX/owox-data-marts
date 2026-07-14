/**
 * Copyright (c) OWOX, Inc.
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

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
          description: 'Google Sheets spreadsheet ID or full spreadsheet URL',
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
        CreateEmptyTables: {
          requiredType: 'boolean',
          default: true,
          label: 'Create Empty Tables',
          description:
            'Create the destination table from headers even when the sheet has no data rows',
          attributes: [CONFIG_ATTRIBUTES.ADVANCED],
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

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiryTime && Date.now() < this.tokenExpiryTime) {
      return this.accessToken;
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
      });
    } else if (authType === 'service_account') {
      this.accessToken = await OAuthUtils.getServiceAccountToken({
        config: this.config,
        tokenUrl: 'https://oauth2.googleapis.com/token',
        serviceAccountKeyJson: authConfig.ServiceAccountKey.value,
        scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
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

  async fetchFieldsSchema() {
    const values = await this._fetchSheetValues();
    const { columns, rows } = this._buildSheetSnapshot(values, false);
    const schema = this._inferSchema(columns, rows);

    return this._buildFieldsSchema(schema, {
      includeTechnicalFields: true,
      includeTechnicalFieldsInDefaultFields: false,
    });
  }

  async _fetchSheetValues() {
    const accessToken = await this.getAccessToken();
    const spreadsheetId = this._extractSpreadsheetId(this.config.SpreadsheetId.value);
    const range = this._buildA1Range();
    const encodedRange = encodeURIComponent(range);
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}` +
      '?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';

    try {
      const response = await this.urlFetchWithRetry(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        muteHttpExceptions: true,
      });
      const payload = await response.getAsJson();
      return Array.isArray(payload.values) ? payload.values : [];
    } catch (error) {
      throw new HttpRequestException({
        message: this._buildSheetRequestErrorMessage(error),
        statusCode: error?.statusCode,
        payload: error?.payload,
      });
    }
  }

  _buildSheetSnapshot(values, applySelectedFields) {
    const headerRowNumber = Number(this.config.HeaderRow.value);
    if (!Number.isInteger(headerRowNumber) || headerRowNumber < 1) {
      throw new Error('Header Row must be a whole number greater than or equal to 1');
    }

    const headerIndex = headerRowNumber - 1;
    const headerRow = values[headerIndex] || [];
    const detectedColumns = this._buildColumnDefinitions(headerRow);

    if (detectedColumns.length === 0) {
      throw new Error(
        `No headers found in row ${headerIndex + 1} of '${this.config.SheetName.value}'. ` +
          'Check the sheet tab name, optional range, and header row.'
      );
    }

    const columns = applySelectedFields
      ? this._filterColumnsBySelectedFields(detectedColumns)
      : detectedColumns;
    if (columns.length === 0) {
      throw new Error('No columns selected for import');
    }

    const dataRows = values.slice(headerIndex + 1);
    const firstDataRowNumber = headerIndex + 2;
    const rows = this._buildRows(dataRows, columns, firstDataRowNumber);

    return { columns, rows };
  }

  isValidToRetry(error) {
    return !error?.statusCode
      || error.statusCode >= HTTP_STATUS.SERVER_ERROR_MIN
      || error.statusCode === HTTP_STATUS.TOO_MANY_REQUESTS;
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

  _buildA1Range() {
    const configuredRange = String(this.config.Range?.value || '').trim();
    if (configuredRange && configuredRange.includes('!')) {
      return configuredRange;
    }

    const sheetName = this._quoteSheetName(this.config.SheetName.value);
    return configuredRange ? `${sheetName}!${configuredRange}` : sheetName;
  }

  _quoteSheetName(sheetName) {
    return `'${String(sheetName).replace(/'/g, "''")}'`;
  }

  _buildColumnDefinitions(headerRow) {
    const usedNames = {};
    const reservedNames = new Set(['_owox_row_number', '_owox_imported_at']);

    return headerRow
      .map((header, index) => {
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
        };
      })
      .filter(column => column.name);
  }

  _filterColumnsBySelectedFields(columns) {
    const selectedFields = this._getSelectedSheetFieldNames();

    if (selectedFields.length === 0) {
      return columns;
    }

    const matchedColumns = columns.filter(column => {
      return selectedFields.some(selectedField =>
        this._columnMatchesSelectedField(column, selectedField)
      );
    });

    if (matchedColumns.length === 0) {
      const availableColumns = this._formatAvailableColumns(columns);
      throw new Error(
        `None of the selected columns were found in the sheet: ${selectedFields.join(', ')}. ` +
          `Available columns: ${availableColumns}`
      );
    }

    const missingFields = selectedFields.filter(selectedField => {
      return !matchedColumns.some(column => this._columnMatchesSelectedField(column, selectedField));
    });

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
      .filter(fieldName => !this._isTechnicalField(fieldName));
  }

  _columnMatchesSelectedField(column, selectedField) {
    return this._getColumnMatchKeys(column).includes(this._normalizeMatchValue(selectedField));
  }

  _getColumnMatchKeys(column) {
    return [
      column.name,
      column.originalName,
      this._normalizeColumnName(column.originalName || ''),
      `column_${column.index + 1}`,
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

    return name.slice(0, 300);
  }

  _deduplicateColumnName(name, usedNames) {
    if (!usedNames[name]) {
      usedNames[name] = 1;
      return name;
    }

    usedNames[name] += 1;
    let candidate = `${name}_${usedNames[name]}`;
    while (usedNames[candidate]) {
      usedNames[name] += 1;
      candidate = `${name}_${usedNames[name]}`;
    }
    usedNames[candidate] = 1;
    return candidate;
  }

  _buildRows(dataRows, columns, firstDataRowNumber) {
    const importedAt = new Date().toISOString();

    return dataRows
      .map((row, index) => {
        const normalizedRow = {
          _owox_row_number: firstDataRowNumber + index,
          _owox_imported_at: importedAt,
        };

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

    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }

    return value;
  }

  _inferSchema(columns, rows) {
    const fields = {
      _owox_row_number: {
        type: DATA_TYPES.INTEGER,
        description: 'Source sheet row number',
      },
      _owox_imported_at: {
        type: DATA_TYPES.TIMESTAMP,
        description: 'Timestamp when OWOX imported the sheet row',
      },
    };

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

    if (values.every(value => this._isDate(value))) {
      return DATA_TYPES.DATE;
    }

    if (values.every(value => this._isDateTime(value))) {
      return DATA_TYPES.DATETIME;
    }

    if (values.every(value => this._isTimestamp(value))) {
      return DATA_TYPES.TIMESTAMP;
    }

    return DATA_TYPES.STRING;
  }

  _isBoolean(value) {
    if (typeof value === 'boolean') {
      return true;
    }
    return /^(true|false)$/i.test(String(value).trim());
  }

  _isInteger(value) {
    if (typeof value === 'number') {
      return Number.isInteger(value);
    }
    return /^[-+]?\d+$/.test(String(value).trim());
  }

  _isNumber(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(String(value).trim());
  }

  _isDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim());
  }

  _isDateTime(value) {
    return /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(String(value).trim());
  }

  _isTimestamp(value) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/.test(String(value).trim());
  }
};
