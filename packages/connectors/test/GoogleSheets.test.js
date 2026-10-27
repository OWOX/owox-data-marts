import assert from 'node:assert/strict';
import { test } from 'vitest';
import { GoogleSheetsSource } from '../src/Sources/GoogleSheets/Source.js';
import { AbstractConnector } from '../src/Core/AbstractConnector.js';

const DATA_TYPES = {
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  INTEGER: 'INTEGER',
  NUMBER: 'NUMBER',
  DATE: 'DATE',
  DATETIME: 'DATETIME',
  TIMESTAMP: 'TIMESTAMP',
};

class HttpRequestException extends Error {
  constructor({ message, statusCode, payload }) {
    super(message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

class ConnectorConfigurationException extends Error {}

class OauthFlowException extends Error {
  constructor({ message, payload }) {
    super(message);
    this.name = 'OauthFlowException';
    this.payload = payload;
  }
}

// src/Core/Utils/AsyncUtils.js is bundle-only (`var AsyncUtils = class …`, no
// export), so it cannot be imported here. This mirrors its one method exactly.
const AsyncUtils = {
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

const OauthCredentialsDto = {
  builder() {
    const value = {};
    const builder = {
      withUser(user) {
        value.user = user;
        return builder;
      },
      withSecret(secret) {
        value.secret = secret;
        return builder;
      },
      withExpiresIn(expiresIn) {
        value.expiresIn = expiresIn;
        return builder;
      },
      build() {
        return { toObject: () => value };
      },
    };
    return builder;
  },
};

// The source reads these as bare globals, the way the built bundle supplies them;
// only its base class is a real import.
//
// Every name here must be one the built bundle actually defines. `HttpUtils` used
// to be stubbed in this list: the Core util behind it was deleted when HTTP moved
// into AbstractSource, but the source kept calling it, and the stub kept 26 tests
// green against a fake the runtime no longer had. The source now goes through the
// runtime's own `fetch`, which the tests below stub per-test instead.
Object.assign(globalThis, {
  DATA_TYPES,
  LOG_LEVEL: { INFO: 'info', WARN: 'warn', ERROR: 'error' },
  HTTP_STATUS: {
    UNAUTHORIZED: 401,
    TOO_MANY_REQUESTS: 429,
    SUCCESS_MIN: 200,
    SUCCESS_MAX: 299,
    SERVER_ERROR_MIN: 500,
  },
  AsyncUtils,
  HttpRequestException,
  ConnectorConfigurationException,
  OauthCredentialsDto,
  OauthFlowException,
  PARAMETER_OWNER: { SOURCE: 'source', STORAGE: 'storage' },
  CONFIG_ATTRIBUTES: {
    SECRET: 'SECRET',
    ADVANCED: 'ADVANCED',
    HIDE_IN_CONFIG_FORM: 'HIDE_IN_CONFIG_FORM',
    OAUTH_FLOW: 'OAUTH_FLOW',
    DYNAMIC_OPTIONS: 'DYNAMIC_OPTIONS',
  },
  OAUTH_CONSTANTS: {
    UI: 'UI',
    SECRET: 'SECRET',
    REQUIRED: 'REQUIRED',
  },
});

function createSource({
  headerRow = 1,
  range = '',
  importAllColumns = true,
  fields = 'sheet _owox_row_number',
  inferTypes = true,
  authType = null,
  outputSchemaFieldTypes,
} = {}) {
  const logs = [];
  const source = Object.create(GoogleSheetsSource.prototype);
  const parameters = {
    HeaderRow: { value: headerRow },
    Range: { value: range },
    SheetName: { value: 'Data' },
    SpreadsheetId: { value: 'spreadsheet-id' },
    ImportAllColumns: { value: importAllColumns },
    Fields: { value: fields },
    InferTypes: { value: inferTypes },
    MaxFetchRetries: { value: 3 },
    InitialRetryDelay: { value: 1 },
  };
  if (authType) {
    parameters.AuthType = { value: authType, items: {} };
  }
  if (outputSchemaFieldTypes !== undefined) {
    parameters.OutputSchemaFieldTypes = { value: outputSchemaFieldTypes };
  }
  source.context = {
    getParameter: name => parameters[name] ?? null,
    log(_level, message) {
      logs.push(message);
    },
    emitAnalytics() {},
  };
  source.logs = logs;
  source.accessToken = null;
  source.tokenExpiryTime = null;
  return source;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const originalFetch = globalThis.fetch;

/**
 * Runs `run` with `globalThis.fetch` replaced by `responder`.
 *
 * The source calls the runtime's own `fetch` directly — there is no HTTP
 * indirection object left to substitute — so this stubs the real thing and hands
 * back real `Response` objects. A test that passed against a hand-rolled response
 * shape would prove nothing about what ships.
 *
 * @param {(url: string, options: object, callNumber: number) => Response} responder
 * @param {(calls: Array<{url: string, options: object}>) => Promise<void>} run
 */
async function withFetch(responder, run) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return responder(url, options, calls.length);
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

test('preserves explicit false defaults inside the Google Sheets configuration only', () => {
  const parameters = {
    InferTypes: { value: false },
    ImportAllColumns: { value: false },
  };
  let registered;
  const context = {
    getParameter: name => parameters[name] ?? null,
    registerParameters(declared) {
      registered = declared;
    },
    log() {},
  };

  const source = new GoogleSheetsSource(context);

  assert.deepEqual(
    Array.from(registered.AuthType.oneOf, option => option.value),
    ['oauth2', 'service_account']
  );
  // A declared default of `true` would be applied over the user's explicit
  // `false` during validation, so the constructor has to read the value first.
  assert.equal(registered.InferTypes.default, false);
  assert.equal(registered.ImportAllColumns.default, false);
  assert.equal(source.parameters, registered);
});

test('rejects OAuth authorization when required Google Sheets permissions were not granted', async () => {
  const source = Object.create(GoogleSheetsSource.prototype);

  await withFetch(
    () =>
      jsonResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/userinfo.email',
      }),
    () =>
      assert.rejects(
        source.exchangeOauthCredentials(
          { code: 'authorization-code' },
          {
            ClientId: 'client-id',
            ClientSecret: 'client-secret',
            RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
          }
        ),
        error =>
          error instanceof OauthFlowException &&
          error.name === 'OauthFlowException' &&
          /authorization is missing required permissions/.test(error.message)
      )
  );
});

// The token exchange runs with no `this.context`: the backend builds the source
// only to call this method, and the OAuth callback is a single-use authorization
// code. It therefore uses bare `fetch`, not `urlFetchWithRetry` — which would
// need a context and would retry a code that cannot be redeemed twice.
test('exchanges OAuth credentials with a form-encoded POST and no run context', async () => {
  const source = Object.create(GoogleSheetsSource.prototype);
  assert.equal(source.context, undefined);

  await withFetch(
    (_url, _options, callNumber) =>
      callNumber === 1
        ? jsonResponse({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            scope:
              'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
          })
        : jsonResponse({ id: 'google-user-1', email: 'analyst@example.com' }),
    async calls => {
      await source.exchangeOauthCredentials(
        { code: 'authorization-code' },
        {
          ClientId: 'client-id',
          ClientSecret: 'client-secret',
          RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
        }
      );

      assert.equal(calls[0].url, 'https://oauth2.googleapis.com/token');
      assert.equal(calls[0].options.method, 'post');
      assert.equal(calls[0].options.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.match(calls[0].options.body, /(^|&)code=authorization-code(&|$)/);
      assert.match(calls[0].options.body, /(^|&)grant_type=authorization_code(&|$)/);
      assert.equal(calls[1].url, 'https://www.googleapis.com/oauth2/v2/userinfo');
      assert.equal(calls[1].options.headers.Authorization, 'Bearer access-token');
    }
  );
});

// Google reports `invalid_grant` as HTTP 400 with the reason in the body. The
// exchange must read that body rather than throwing on the status, or the user
// sees "HTTP 400" instead of what actually went wrong.
test('surfaces the provider error description from a non-2xx token response', async () => {
  const source = Object.create(GoogleSheetsSource.prototype);

  await withFetch(
    () =>
      jsonResponse(
        { error: 'invalid_grant', error_description: 'Code was already redeemed.' },
        { status: 400 }
      ),
    () =>
      assert.rejects(
        source.exchangeOauthCredentials(
          { code: 'authorization-code' },
          { ClientId: 'client-id', ClientSecret: 'client-secret', RedirectUri: 'https://x/cb' }
        ),
        error =>
          error instanceof OauthFlowException &&
          error.message === 'Token exchange failed: Code was already redeemed.'
      )
  );
});

test('stores the verified Google account used by Google Picker', async () => {
  const responses = [
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      scope:
        'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
    },
    { id: 'google-user-1', email: 'analyst@example.com' },
  ];
  const source = Object.create(GoogleSheetsSource.prototype);

  await withFetch(
    () => jsonResponse(responses.shift()),
    async () => {
      const credentials = await source.exchangeOauthCredentials(
        { code: 'authorization-code' },
        {
          ClientId: 'client-id',
          ClientSecret: 'client-secret',
          RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
        }
      );

      assert.deepEqual(plain(credentials.user), {
        id: 'google-user-1',
        name: 'analyst@example.com',
        email: 'analyst@example.com',
      });
      assert.equal(credentials.expiresIn, null);
    }
  );
});

test('gives OAuth users Picker-specific guidance for access errors', () => {
  const source = createSource({ authType: 'oauth2' });

  assert.match(
    source._buildSheetRequestErrorMessage({ statusCode: 403, message: 'Forbidden' }),
    /choose the spreadsheet with Google Picker/
  );
  assert.doesNotMatch(
    source._buildSheetRequestErrorMessage({ statusCode: 403, message: 'Forbidden' }),
    /service account/
  );
});

test('rejects OAuth authorization when Google does not return an email address', async () => {
  const responses = [
    {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      scope:
        'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
    },
    { id: 'google-user-1' },
  ];
  const source = Object.create(GoogleSheetsSource.prototype);

  await withFetch(
    () => jsonResponse(responses.shift()),
    () =>
      assert.rejects(
        source.exchangeOauthCredentials(
          { code: 'authorization-code' },
          {
            ClientId: 'client-id',
            ClientSecret: 'client-secret',
            RedirectUri: 'https://app.example.com/oauth/google-sheets/callback',
          }
        ),
        /email address required by Google Picker/
      )
  );
});

// A userinfo body that is not JSON must still land on the account-verification
// message: the inner try/catch is what turns a parse failure into it.
test('reports an unverifiable Google account when userinfo is not JSON', async () => {
  const source = Object.create(GoogleSheetsSource.prototype);

  await withFetch(
    (_url, _options, callNumber) =>
      callNumber === 1
        ? jsonResponse({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            scope:
              'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
          })
        : new Response('<html>gateway error</html>', { status: 502 }),
    () =>
      assert.rejects(
        source.exchangeOauthCredentials(
          { code: 'authorization-code' },
          { ClientId: 'client-id', ClientSecret: 'client-secret', RedirectUri: 'https://x/cb' }
        ),
        error =>
          error instanceof OauthFlowException &&
          /Could not verify the Google account/.test(error.message)
      )
  );
});

test('maps an absolute header row into an offset range and preserves absolute row numbers', () => {
  const source = createSource({ headerRow: 6, range: 'B5:C' });
  const snapshot = source._buildSheetSnapshot(
    [['ignored'], ['Name', 'Text ID'], ['Ada', '00123'], [], ['Lin', '00456']],
    true
  );

  assert.deepEqual(
    Array.from(snapshot.columns, column => column.name),
    ['name', 'text_id']
  );
  assert.deepEqual(
    plain(snapshot.rows).map(row => [row._owox_row_number, row.name, row.text_id]),
    [
      [7, 'Ada', '00123'],
      [9, 'Lin', '00456'],
    ]
  );
  assert.equal(source._buildA1Range(), "'Data'!B5:C");
  assert.equal(source._buildA1Range({ preview: true }), "'Data'!B6:C106");
});

test('previews every supported import column and at most 100 sample rows', () => {
  const source = createSource({ headerRow: 4 });

  assert.equal(source._buildA1Range({ preview: true }), "'Data'!A4:BIL104");
  assert.equal(source._buildA1Range(), "'Data'!A1:ZZZ");
  assert.deepEqual(plain(source._parseA1GridRange('$B$5:$D$20')), {
    startColumn: 2,
    endColumn: 4,
    startRow: 5,
    endRow: 20,
  });
});

test('does not allow Range to override the selected sheet tab', () => {
  const sameSheetSource = createSource({ range: "'Data'!A:D" });
  assert.equal(sameSheetSource._buildA1Range(), "'Data'!A1:D");

  const otherSheetSource = createSource({ range: "'Other'!A:D" });
  assert.throws(() => otherSheetSource._buildA1Range(), /Range must use the selected sheet 'Data'/);
});

test('rejects configured ranges that are not supported A1 notation', () => {
  const source = createSource({ range: 'R5C2:R10C4' });

  assert.throws(
    () => source._buildA1Range(),
    error =>
      error instanceof ConnectorConfigurationException &&
      error.message === 'Range must use A1 notation, for example A:D or B5:D20'
  );
});

test('extracts and validates spreadsheet IDs before building provider requests', () => {
  const source = createSource();

  assert.equal(source._extractSpreadsheetId(' spreadsheet-id_123 '), 'spreadsheet-id_123');
  assert.equal(
    source._extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/spreadsheet-id_123/edit#gid=0'
    ),
    'spreadsheet-id_123'
  );
  assert.throws(
    () => source._extractSpreadsheetId('spreadsheet-id/values?unexpected=true'),
    error =>
      error instanceof ConnectorConfigurationException &&
      error.message === 'Spreadsheet ID or URL is invalid'
  );
});

test('preserves configuration errors wrapped by the Google Sheets request', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'token';
  source._fetchSheetResponse = async () =>
    new Response('', { headers: { 'content-length': String(50 * 1024 * 1024 + 1) } });

  await assert.rejects(
    source._fetchSheetValues(),
    error =>
      error instanceof HttpRequestException &&
      error.cause instanceof ConnectorConfigurationException
  );
});

test('falls back to STRING for numeric values outside JavaScript safe precision', () => {
  const source = createSource();

  assert.equal(source._inferType([Number.MAX_SAFE_INTEGER]), DATA_TYPES.INTEGER);
  assert.equal(source._inferType([Number.MAX_SAFE_INTEGER + 1]), DATA_TYPES.STRING);
  assert.equal(source._inferType([-(Number.MAX_SAFE_INTEGER + 1)]), DATA_TYPES.STRING);
});

test('rejects more selected columns than the portable warehouse limit', () => {
  const source = createSource();
  const columns = Array.from({ length: 1599 }, (_, index) => ({ name: `column_${index + 1}` }));

  assert.throws(() => source._assertImportSize({ length: 100001 }), /100,000 data rows/);
  assert.throws(
    () => source._assertImportColumnCount(columns),
    /support up to 1,598 sheet columns/
  );
});

test('selects duplicate and colliding headers by their canonical unique identifier', () => {
  const source = createSource({
    importAllColumns: false,
    fields: 'sheet _owox_row_number, sheet name_2, sheet order_id_2',
  });
  const snapshot = source._buildSheetSnapshot(
    [
      ['Name', 'Name', 'Order ID', 'Order-ID'],
      ['first', 'second', 'A', 'B'],
    ],
    true
  );

  assert.deepEqual(
    Array.from(snapshot.columns, column => column.name),
    ['name_2', 'order_id_2']
  );
  assert.equal(snapshot.rows[0].name_2, 'second');
  assert.equal(snapshot.rows[0].order_id_2, 'B');
  assert.equal(snapshot.rows[0].name, undefined);
  assert.equal(snapshot.rows[0].order_id, undefined);
});

test('keeps duplicate suffixes inside the portable 127-byte identifier limit', () => {
  const source = createSource();
  const longHeader = 'a'.repeat(180);
  const columns = source._buildColumnDefinitions([
    longHeader,
    longHeader,
    `${longHeader}_2`,
    '_owox_row_number',
  ]);

  assert.equal(new Set(columns.map(column => column.name)).size, 4);
  assert.ok(columns.every(column => Buffer.byteLength(column.name, 'utf8') <= 127));
  assert.match(columns[1].name, /_2$/);
  assert.equal(columns[3].name, 'sheet_owox_row_number');
});

test('never infers a type from text that only looks typed', () => {
  const source = createSource();
  const columns = source._buildColumnDefinitions([
    'Text ID',
    'Text Boolean',
    'Text Date',
    'Native Integer',
    'Native Number',
    'Native Boolean',
  ]);
  const rows = source._buildRows([['00123', 'true', '2026-01-01', 123, 1.5, true]], columns, 2);
  const schema = source._inferSchema(columns, rows);

  assert.equal(schema.text_id.type, DATA_TYPES.STRING);
  assert.equal(schema.text_boolean.type, DATA_TYPES.STRING);
  assert.equal(schema.text_date.type, DATA_TYPES.STRING);
  assert.equal(schema.native_integer.type, DATA_TYPES.INTEGER);
  assert.equal(schema.native_number.type, DATA_TYPES.NUMBER);
  assert.equal(schema.native_boolean.type, DATA_TYPES.BOOLEAN);
});

test('builds a schema and zero rows for a header-only snapshot', () => {
  const source = createSource();
  const snapshot = source._buildSheetSnapshot([['Name', 'ID']], true);
  const schema = source._inferSchema(snapshot.columns, snapshot.rows);

  assert.equal(snapshot.rows.length, 0);
  assert.equal(schema.name.type, DATA_TYPES.STRING);
  assert.equal(schema.id.type, DATA_TYPES.STRING);
  assert.deepEqual(Object.keys(schema), ['_owox_row_number', 'name', 'id']);
});

test('all-columns mode picks up additions while subset mode drops missing selections', () => {
  const allColumnsSource = createSource({
    importAllColumns: true,
    fields: 'sheet _owox_row_number, sheet existing',
  });
  const allSnapshot = allColumnsSource._buildSheetSnapshot(
    [
      ['Existing', 'Added'],
      ['old', 'new'],
    ],
    true
  );
  assert.deepEqual(
    Array.from(allSnapshot.columns, column => column.name),
    ['existing', 'added']
  );

  const subsetSource = createSource({
    importAllColumns: false,
    fields: 'sheet _owox_row_number, sheet existing, sheet removed',
  });
  const subsetSnapshot = subsetSource._buildSheetSnapshot(
    [
      ['Existing', 'Added'],
      ['old', 'new'],
    ],
    true
  );
  assert.deepEqual(
    Array.from(subsetSnapshot.columns, column => column.name),
    ['existing']
  );
  assert.match(subsetSource.logs[0], /removed/);
});

test('uses the selected fields subset and never writes unselected sheet columns', () => {
  const source = createSource({
    importAllColumns: 'false',
    fields: 'sheet _owox_row_number, sheet campaign, sheet spend',
  });

  const snapshot = source._buildSheetSnapshot(
    [
      ['Campaign', 'Spend', 'Internal note'],
      ['Brand', 100, 'do not import'],
    ],
    true
  );
  const schema = source._inferSchema(snapshot.columns, snapshot.rows);

  assert.deepEqual(
    Array.from(snapshot.columns, column => column.name),
    ['campaign', 'spend']
  );
  assert.deepEqual(Object.keys(snapshot.rows[0]), ['_owox_row_number', 'campaign', 'spend']);
  assert.deepEqual(Object.keys(schema), ['_owox_row_number', 'campaign', 'spend']);
});

test('keeps rows that have values only in unselected columns', () => {
  const source = createSource({
    importAllColumns: false,
    fields: 'sheet _owox_row_number, sheet notes',
  });

  const snapshot = source._buildSheetSnapshot(
    [
      ['Name', 'Email', 'Notes'],
      ['Ada', 'ada@example.test', 'Keep'],
      ['Bob', 'bob@example.test', ''],
      ['Cara', 'cara@example.test'],
    ],
    true
  );

  assert.deepEqual(
    Array.from(snapshot.rows, row => row._owox_row_number),
    [2, 3, 4]
  );
  assert.deepEqual(
    Array.from(snapshot.rows, row => row.notes),
    ['Keep', null, null]
  );
});

test('does not map a missing generated column name to a newly named column at the same position', () => {
  const source = createSource({
    importAllColumns: false,
    fields: 'sheet _owox_row_number, sheet product_keys, sheet test1, sheet column_5',
  });

  const snapshot = source._buildSheetSnapshot(
    [
      ['Product Keys', 'Unused 1', 'Test1', 'Unused 2', 'Product Keys With Session'],
      [6556956, 'ignore', 11, 'ignore', 6556956],
    ],
    true
  );
  const schema = source._inferSchema(snapshot.columns, snapshot.rows);

  assert.deepEqual(
    Array.from(snapshot.columns, column => column.name),
    ['product_keys', 'test1']
  );
  assert.deepEqual(Object.keys(snapshot.rows[0]), ['_owox_row_number', 'product_keys', 'test1']);
  assert.deepEqual(Object.keys(schema), ['_owox_row_number', 'product_keys', 'test1']);
  assert.equal(snapshot.rows[0].product_keys_with_session, undefined);
  assert.match(source.logs[0], /column_5/);
});

test('preview exposes both technical fields but imported-at remains optional at runtime', () => {
  const sourceWithoutImportedAt = createSource();
  const columns = sourceWithoutImportedAt._buildColumnDefinitions(['Name']);
  const rows = sourceWithoutImportedAt._buildRows([['Ada']], columns, 2);
  const runtimeSchema = sourceWithoutImportedAt._inferSchema(columns, rows);
  const previewSchema = sourceWithoutImportedAt._buildFieldsSchema(
    sourceWithoutImportedAt._inferSchema(columns, rows, { includeImportedAt: true })
  );

  assert.equal(rows[0]._owox_imported_at, undefined);
  assert.equal(runtimeSchema._owox_imported_at, undefined);
  assert.ok(previewSchema.sheet.fields._owox_row_number);
  assert.ok(previewSchema.sheet.fields._owox_imported_at);
  assert.ok(previewSchema.sheet.defaultFields.includes('_owox_imported_at'));
  assert.deepEqual(Array.from(previewSchema.sheet.uniqueKeys), ['_owox_row_number']);

  const sourceWithImportedAt = createSource({
    fields: 'sheet _owox_row_number, sheet _owox_imported_at',
  });
  const selectedRows = sourceWithImportedAt._buildRows([['Ada']], columns, 2);
  const selectedSchema = sourceWithImportedAt._inferSchema(columns, selectedRows);
  assert.equal(typeof selectedRows[0]._owox_imported_at, 'string');
  assert.match(selectedRows[0]._owox_imported_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  assert.equal(selectedSchema._owox_imported_at.type, DATA_TYPES.TIMESTAMP);
});

test('does not retry or wrap an aborted Google Sheets request', async () => {
  const source = createSource();
  const abortController = new AbortController();
  const reason = new Error('preview cancelled');
  abortController.abort(reason);
  source.getAccessToken = async () => 'token';

  await assert.rejects(
    source._fetchSheetValues({ signal: abortController.signal }),
    error => error === reason
  );
  assert.equal(source.logs.length, 0);
});

test('refreshes a rejected token once and honors numeric Retry-After values', async () => {
  const source = createSource();
  const tokenCalls = [];
  let requestCount = 0;
  source.getAccessToken = async options => {
    tokenCalls.push(options.forceRefresh);
    return options.forceRefresh ? 'fresh-token' : 'stale-token';
  };
  source._fetchSheetResponse = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      throw new HttpRequestException({ message: 'Unauthorized', statusCode: 401 });
    }
    return new Response(JSON.stringify({ values: [['Name']] }));
  };

  assert.deepEqual(plain(await source._fetchSheetValues()), [['Name']]);
  assert.deepEqual(tokenCalls, [false, true]);
  assert.equal(
    source._getRetryAfterMs(new Response(null, { headers: { 'Retry-After': '7' } })),
    7000
  );
});

test('rejects oversized responses before reading their body', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'token';
  source._fetchSheetResponse = async () => {
    const response = new Response('', {
      headers: { 'content-length': String(50 * 1024 * 1024 + 1) },
    });
    response.text = async () => assert.fail('body should not be read');
    return response;
  };
  await assert.rejects(source._fetchSheetValues(), /response exceeds the 50 MB import limit/);
});

// These exercise the real _fetchSheetResponse rather than replacing it. It was
// the one call path with no coverage at all, which is how a call to a deleted
// HTTP helper survived in it.
test('reads a sheet through the runtime fetch and returns its values', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'sheet-token';

  await withFetch(
    () => jsonResponse({ values: [['Name'], ['Ada']] }),
    async calls => {
      assert.deepEqual(plain(await source._fetchSheetValues()), [['Name'], ['Ada']]);
      assert.match(calls[0].url, /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\//);
      assert.equal(calls[0].options.headers.Authorization, 'Bearer sheet-token');
    }
  );
});

test('turns a non-2xx sheet response into an error carrying its status and payload', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'sheet-token';

  await withFetch(
    () =>
      jsonResponse(
        { error: { code: 404, message: 'Requested entity was not found.' } },
        { status: 404 }
      ),
    () =>
      assert.rejects(source._fetchSheetValues(), error => {
        assert.equal(error.statusCode, 404);
        assert.equal(error.payload.error.code, 404);
        assert.match(error.message, /spreadsheet was not found: Requested entity was not found\./);
        return true;
      })
  );
});

test('propagates a 401 from the real request path so the token is refreshed once', async () => {
  const source = createSource();
  const tokenCalls = [];
  source.getAccessToken = async options => {
    tokenCalls.push(options.forceRefresh);
    return options.forceRefresh ? 'fresh-token' : 'stale-token';
  };

  await withFetch(
    (_url, _options, callNumber) =>
      callNumber === 1
        ? jsonResponse({ error: { message: 'Invalid Credentials' } }, { status: 401 })
        : jsonResponse({ values: [['Name']] }),
    async calls => {
      assert.deepEqual(plain(await source._fetchSheetValues()), [['Name']]);
      assert.deepEqual(tokenCalls, [false, true]);
      assert.equal(calls[0].options.headers.Authorization, 'Bearer stale-token');
      assert.equal(calls[1].options.headers.Authorization, 'Bearer fresh-token');
    }
  );
});

test('retries a 429 from the real request path after the Retry-After delay', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'sheet-token';

  await withFetch(
    (_url, _options, callNumber) =>
      callNumber === 1
        ? jsonResponse(
            { error: { message: 'Rate limited' } },
            {
              status: 429,
              headers: { 'Retry-After': '0' },
            }
          )
        : jsonResponse({ values: [['Name']] }),
    async calls => {
      assert.deepEqual(plain(await source._fetchSheetValues()), [['Name']]);
      assert.equal(calls.length, 2);
      assert.ok(source.logs.some(message => /Retrying Google Sheets request/.test(message)));
    }
  );
});

// main waited Initial Retry Delay before the first retry; the port ignored the setting and
// started at twice the built-in default.
test('waits the configured Initial Retry Delay before its first retry', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'sheet-token';
  const getParameter = source.context.getParameter;
  source.context.getParameter = name =>
    name === 'InitialRetryDelay' ? { value: 1000 } : getParameter(name);
  const delays = [];
  source._delayWithAbort = async ms => {
    delays.push(ms);
  };

  await withFetch(
    (_url, _options, callNumber) =>
      callNumber === 1
        ? jsonResponse({ error: { message: 'Backend Error' } }, { status: 503 })
        : jsonResponse({ values: [['Name']] }),
    async calls => {
      assert.deepEqual(plain(await source._fetchSheetValues()), [['Name']]);
      assert.equal(calls.length, 2);
    }
  );
  assert.equal(delays.length, 1);
  assert.ok(delays[0] >= 500 && delays[0] <= 1500, `first retry after ${delays[0]} ms`);
});

test('does not retry a non-retryable status from the real request path', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'sheet-token';

  await withFetch(
    () => jsonResponse({ error: { message: 'Unable to parse range' } }, { status: 400 }),
    async calls => {
      await assert.rejects(source._fetchSheetValues(), /could not read the selected range/);
      assert.equal(calls.length, 1);
    }
  );
});

// The behaviour this covers moved out of a per-connector Connector class into
// AbstractConnector's full-refresh node mode, which any source can opt into with
// `isFullRefresh` — Google Sheets is simply its first user.
test('connector always publishes empty snapshots and reports only the runtime schema fields', async () => {
  const connector = Object.create(AbstractConnector.prototype);
  const updates = [];
  const replacements = [];
  const parameters = {
    Fields: { value: 'sheet _owox_row_number' },
    ImportAllColumns: { value: false },
  };
  connector.context = {
    getParameter: name => parameters[name] ?? null,
    storageConfig: {},
    log() {},
    updateFields(fields) {
      updates.push({ fields });
    },
  };
  connector.source = {
    fieldsSchema: {
      sheet: {
        fields: {
          _owox_row_number: { type: DATA_TYPES.INTEGER },
          _owox_imported_at: { type: DATA_TYPES.TIMESTAMP },
          name: { type: DATA_TYPES.STRING },
        },
      },
    },
    fetchData: async () => [],
  };
  connector.getStorageForNode = () => ({
    replaceData: async data => replacements.push(data),
  });

  await connector.processFullRefreshNode('sheet', ['_owox_row_number'], {}, null);

  assert.deepEqual(plain(updates), [
    {
      fields: ['_owox_row_number', '_owox_imported_at', 'name'],
    },
  ]);
  // Rewritten from the schema the fetch discovered, not left at the stale
  // selection the run started with.
  assert.equal(
    parameters.Fields.value,
    'sheet _owox_row_number, sheet _owox_imported_at, sheet name'
  );
  // An empty sheet still publishes: that is how rows deleted upstream disappear.
  assert.deepEqual(replacements, [[]]);
});

// The Sheet Name picker and its setup form, ported from main (#1605).

test('declares Sheet Name as a dynamic-options field and keeps Header Row and Range advanced', () => {
  let registered;
  new GoogleSheetsSource({
    getParameter: () => null,
    registerParameters(declared) {
      registered = declared;
    },
    log() {},
  });

  assert.deepEqual(plain(registered.SheetName.attributes), ['DYNAMIC_OPTIONS']);
  assert.deepEqual(plain(registered.SheetName.optionsDependsOn), ['AuthType', 'SpreadsheetId']);
  assert.deepEqual(plain(registered.HeaderRow.attributes), ['ADVANCED']);
  assert.deepEqual(plain(registered.Range.attributes), ['ADVANCED']);
  assert.equal(registered.HeaderRow.isRequired, true);
  assert.equal(registered.HeaderRow.default, 1);
});

test('lists the spreadsheet tabs in sheet order as Sheet Name options', async () => {
  const source = createSource();
  const requestedUrls = [];
  source.getAccessToken = async () => 'token';
  source._fetchSheetResponse = async url => {
    requestedUrls.push(url);
    return jsonResponse({
      sheets: [
        { properties: { sheetId: 7, title: 'Targets', index: 2 } },
        { properties: { sheetId: 0, title: 'Summary', index: 0 } },
        { properties: { sheetId: 3, title: 'Data', index: 1 } },
        { properties: { sheetId: 9, index: 3 } },
      ],
    });
  };

  const options = await source.fetchFieldOptions('SheetName');

  assert.deepEqual(plain(options), [
    { value: 'Summary', label: 'Summary' },
    { value: 'Data', label: 'Data' },
    { value: 'Targets', label: 'Targets' },
  ]);
  assert.equal(requestedUrls.length, 1);
  assert.match(
    requestedUrls[0],
    /^https:\/\/sheets\.googleapis\.com\/v4\/spreadsheets\/spreadsheet-id\?fields=sheets\.properties/
  );
});

test('refreshes a rejected token once while listing spreadsheet tabs', async () => {
  const source = createSource();
  const tokenCalls = [];
  let requestCount = 0;
  source.getAccessToken = async options => {
    tokenCalls.push(options.forceRefresh);
    return 'token';
  };
  source._fetchSheetResponse = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      throw new HttpRequestException({ message: 'Unauthorized', statusCode: 401 });
    }
    return jsonResponse({ sheets: [{ properties: { title: 'Data', index: 0 } }] });
  };

  assert.deepEqual(plain(await source.fetchFieldOptions('SheetName')), [
    { value: 'Data', label: 'Data' },
  ]);
  assert.deepEqual(tokenCalls, [false, true]);
});

test('requires the spreadsheet before listing its tabs', async () => {
  const source = createSource();
  const getParameter = source.context.getParameter;
  source.context.getParameter = name =>
    name === 'SpreadsheetId' ? { value: '' } : getParameter(name);
  source.getAccessToken = async () => assert.fail('token should not be requested');

  await assert.rejects(source.fetchFieldOptions('SheetName'), error => {
    assert.ok(error instanceof ConnectorConfigurationException);
    assert.match(error.message, /Spreadsheet ID or URL is required/);
    return true;
  });
});

test('rejects dynamic options for fields that do not provide them', async () => {
  const source = createSource();

  await assert.rejects(source.fetchFieldOptions('Range'), error => {
    assert.ok(error instanceof ConnectorConfigurationException);
    assert.match(error.message, /'Range' does not provide dynamic options/);
    return true;
  });
});

test('falls back to the default retry budget when MaxFetchRetries was never validated', async () => {
  const source = createSource();
  const getParameter = source.context.getParameter;
  source.context.getParameter = name => (name === 'MaxFetchRetries' ? null : getParameter(name));
  source._validateResponse = async response => response;

  await withFetch(
    () => jsonResponse({ ok: true }),
    async calls => {
      const response = await source._fetchSheetResponse('https://example.test', 'token');
      assert.equal(response.status, 200);
      assert.equal(calls.length, 1);
    }
  );
});

test('reports a missing credential item as a configuration error instead of a provider outage', async () => {
  const source = createSource();
  let authType = { value: 'oauth2', items: { ClientId: { value: 'client-id' } } };
  const getParameter = source.context.getParameter;
  source.context.getParameter = name => (name === 'AuthType' ? authType : getParameter(name));

  await assert.rejects(source.getAccessToken(), error => {
    assert.ok(error instanceof ConnectorConfigurationException);
    assert.match(error.message, /'AuthType\.ClientSecret' is required/);
    return true;
  });

  authType = { value: 'service_account', items: {} };
  await assert.rejects(source.getAccessToken(), /'AuthType\.ServiceAccountKey' is required/);
});

// --- Native date columns ---------------------------------------------------------------------
//
// One sheet covers every kind of column the date handling has to tell apart. The three reads
// it answers are the ones a run makes: the usual FORMATTED_STRING read, the cell formats of the
// sample, and the SERIAL_NUMBER read of the same range.
const DATE_SHEET_FORMATTED = [
  ['Date', 'Visitors', 'Note', 'When', 'Duration', 'Mixed'],
  ['10/1/2026', 912.5, 'x', '10/1/2026 14:30:00', '36:00:00', '10/1/2026'],
  ['10/2/2026', 1825, 'y', '10/2/2026 08:00:00', '12:00:00', 'TBD'],
];
const DATE_SHEET_SERIAL = [
  ['Date', 'Visitors', 'Note', 'When', 'Duration', 'Mixed'],
  [46296, 912.5, 'x', 46296.604166666664, 1.5, 46296],
  [46297, 1825, 'y', 46297.333333333336, 0.5, 'TBD'],
];
const DATE_SHEET_FORMATS = [
  [null, null, null, null, null, null],
  ['DATE', 'NUMBER', null, 'DATE_TIME', 'TIME', 'DATE'],
  ['DATE', 'NUMBER', null, 'DATE_TIME', 'TIME', null],
];

function formatsResponse(formatRows) {
  return jsonResponse({
    sheets: [
      {
        data: [
          {
            rowData: formatRows.map(row => ({
              values: row.map(type =>
                type ? { effectiveFormat: { numberFormat: { type } } } : {}
              ),
            })),
          },
        ],
      },
    ],
  });
}

function dateSheetResponder({
  formatted = DATE_SHEET_FORMATTED,
  serial = DATE_SHEET_SERIAL,
  formats = DATE_SHEET_FORMATS,
} = {}) {
  return url => {
    if (url.includes('/values/')) {
      return jsonResponse({
        values: url.includes('dateTimeRenderOption=SERIAL_NUMBER') ? serial : formatted,
      });
    }
    return formatsResponse(formats);
  };
}

async function runDateSheet(sourceOptions, responderOptions) {
  const source = createSource(sourceOptions);
  source.getAccessToken = async () => 'token';
  return withFetch(dateSheetResponder(responderOptions), async calls => {
    const rows = await source.fetchData();
    return {
      source,
      calls,
      rows: plain(rows),
      fields: plain(source.fieldsSchema.sheet.fields),
    };
  });
}

function columnOf(rows, name) {
  return rows.map(row => row[name]);
}

test('imports native date and date-time columns as DATE and DATETIME when the Output Schema has no type yet', async () => {
  const { rows, fields, calls } = await runDateSheet();

  assert.deepEqual(columnOf(rows, 'date'), ['2026-10-01', '2026-10-02']);
  assert.deepEqual(columnOf(rows, 'when'), ['2026-10-01 14:30:00', '2026-10-02 08:00:00']);
  assert.equal(fields.date.type, DATA_TYPES.DATE);
  assert.equal(fields.when.type, DATA_TYPES.DATETIME);

  // Everything that is not a native date column is imported exactly as before.
  assert.equal(fields.visitors.type, DATA_TYPES.NUMBER);
  assert.deepEqual(columnOf(rows, 'note'), ['x', 'y']);
  assert.equal(fields.note.type, DATA_TYPES.STRING);
  assert.deepEqual(columnOf(rows, 'duration'), ['36:00:00', '12:00:00']);
  assert.equal(fields.duration.type, DATA_TYPES.STRING);
  assert.deepEqual(columnOf(rows, 'mixed'), ['10/1/2026', 'TBD']);
  assert.equal(fields.mixed.type, DATA_TYPES.STRING);

  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /dateTimeRenderOption=FORMATTED_STRING/);
  assert.match(calls[1].url, /\?ranges=.*&fields=sheets\.data\.rowData\.values\.effectiveFormat/);
  assert.match(calls[2].url, /dateTimeRenderOption=SERIAL_NUMBER/);
});

test('keeps date columns as text, without extra requests, when the Output Schema stores them as text', async () => {
  const { rows, fields, calls, source } = await runDateSheet({
    outputSchemaFieldTypes: JSON.stringify({
      date: 'OTHER',
      visitors: 'OTHER',
      note: 'OTHER',
      when: 'OTHER',
      duration: 'OTHER',
      mixed: 'OTHER',
    }),
  });

  assert.deepEqual(columnOf(rows, 'date'), ['10/1/2026', '10/2/2026']);
  assert.deepEqual(columnOf(rows, 'when'), ['10/1/2026 14:30:00', '10/2/2026 08:00:00']);
  assert.equal(fields.date.type, DATA_TYPES.STRING);
  assert.equal(fields.when.type, DATA_TYPES.STRING);
  assert.equal(calls.length, 1);
  assert.deepEqual(source.logs, []);
});

test('converts the columns the Output Schema declares as DATE or DATETIME', async () => {
  const { rows, fields, source } = await runDateSheet({
    outputSchemaFieldTypes: JSON.stringify({
      date: 'DATETIME',
      when: 'DATE',
      note: 'OTHER',
      mixed: 'OTHER',
      duration: 'OTHER',
      visitors: 'OTHER',
    }),
  });

  assert.deepEqual(columnOf(rows, 'date'), ['2026-10-01 00:00:00', '2026-10-02 00:00:00']);
  assert.deepEqual(columnOf(rows, 'when'), ['2026-10-01', '2026-10-02']);
  assert.equal(fields.date.type, DATA_TYPES.DATETIME);
  assert.equal(fields.when.type, DATA_TYPES.DATE);
  assert.deepEqual(source.logs, []);
});

test('detects dates in a column the Output Schema does not list yet', async () => {
  const { fields } = await runDateSheet({
    outputSchemaFieldTypes: JSON.stringify({ date: 'OTHER', when: 'OTHER' }),
  });

  assert.equal(fields.date.type, DATA_TYPES.STRING);
  assert.equal(fields.when.type, DATA_TYPES.STRING);
  // `mixed` and `duration` are new to the Output Schema but hold no clean dates.
  assert.equal(fields.mixed.type, DATA_TYPES.STRING);
  assert.equal(fields.duration.type, DATA_TYPES.STRING);
});

test('imports a declared date column as text and names the row that is not a date', async () => {
  const { rows, fields, source } = await runDateSheet({
    outputSchemaFieldTypes: JSON.stringify({ mixed: 'DATE', duration: 'DATETIME', note: 'DATE' }),
  });

  assert.deepEqual(columnOf(rows, 'mixed'), ['10/1/2026', 'TBD']);
  assert.equal(fields.mixed.type, DATA_TYPES.STRING);
  assert.equal(fields.duration.type, DATA_TYPES.STRING);
  assert.equal(fields.note.type, DATA_TYPES.STRING);
  assert.equal(source.logs.length, 3);
  assert.ok(
    source.logs.some(message =>
      message.startsWith(
        `Column 'Mixed' is DATE in the Output Schema, but row 3 ("TBD") is not a date in the sheet.`
      )
    )
  );
  assert.ok(
    source.logs.some(message =>
      message.includes(
        `Column 'Duration' is DATETIME in the Output Schema, but row 2 ("36:00:00") is formatted as a time or a duration`
      )
    )
  );
  assert.ok(source.logs.some(message => message.includes(`Column 'Note' is DATE`)));
});

test('keeps a date column as text when a cell below the format sample is not a date', async () => {
  const formatted = [...DATE_SHEET_FORMATTED.map(row => row.slice(0, 1)), ['N/A']];
  const serial = [...DATE_SHEET_SERIAL.map(row => row.slice(0, 1)), ['N/A']];
  // The format sample ends before row 4, so only the serial read can catch it.
  const formats = DATE_SHEET_FORMATS.map(row => row.slice(0, 1));

  const { rows, fields } = await runDateSheet({}, { formatted, serial, formats });

  assert.deepEqual(columnOf(rows, 'date'), ['10/1/2026', '10/2/2026', 'N/A']);
  assert.equal(fields.date.type, DATA_TYPES.STRING);

  const declared = await runDateSheet(
    { outputSchemaFieldTypes: JSON.stringify({ date: 'DATE' }) },
    { formatted, serial, formats }
  );
  assert.equal(declared.fields.date.type, DATA_TYPES.STRING);
  assert.match(declared.source.logs[0], /row 4 \("N\/A"\) is not a date in the sheet/);
});

test('with Infer Types off converts only the columns the Output Schema declares as dates', async () => {
  const undeclared = await runDateSheet({ inferTypes: false });
  assert.equal(undeclared.fields.date.type, DATA_TYPES.STRING);
  assert.deepEqual(columnOf(undeclared.rows, 'date'), ['10/1/2026', '10/2/2026']);
  assert.equal(undeclared.calls.length, 1);

  const declared = await runDateSheet({
    inferTypes: false,
    outputSchemaFieldTypes: JSON.stringify({ date: 'DATE' }),
  });
  assert.equal(declared.fields.date.type, DATA_TYPES.DATE);
  assert.equal(declared.fields.when.type, DATA_TYPES.STRING);
});

test('converts no column when the Output Schema field types cannot be read', async () => {
  const { fields, calls, source } = await runDateSheet({ outputSchemaFieldTypes: '{not json' });

  assert.equal(fields.date.type, DATA_TYPES.STRING);
  assert.equal(calls.length, 1);
  assert.match(source.logs[0], /Could not read the Output Schema field types/);
});

test('reports native date columns as DATE in the field preview', async () => {
  const source = createSource();
  source.getAccessToken = async () => 'token';

  await withFetch(dateSheetResponder(), async calls => {
    const schema = plain(await source.fetchFieldsSchema());

    assert.equal(schema.sheet.fields.date.type, DATA_TYPES.DATE);
    assert.equal(schema.sheet.fields.when.type, DATA_TYPES.DATETIME);
    assert.equal(schema.sheet.fields.mixed.type, DATA_TYPES.STRING);
    assert.match(calls[2].url, /dateTimeRenderOption=SERIAL_NUMBER/);
  });
});

test('converts date serials to warehouse literals', () => {
  const source = createSource();

  assert.equal(source._serialToWarehouseValue(46296, DATA_TYPES.DATE), '2026-10-01');
  // DATE keeps the calendar day a Date-formatted cell shows, even with a time behind it.
  assert.equal(source._serialToWarehouseValue(46296.99, DATA_TYPES.DATE), '2026-10-01');
  assert.equal(
    source._serialToWarehouseValue(46296.604166666664, DATA_TYPES.DATETIME),
    '2026-10-01 14:30:00'
  );
  // Rounded to the second, not truncated: floating point puts 14:30 just below itself.
  assert.equal(
    source._serialToWarehouseValue(46296.60416666, DATA_TYPES.DATETIME),
    '2026-10-01 14:30:00'
  );
  assert.equal(source._serialToWarehouseValue('46296', DATA_TYPES.DATE), null);
  assert.equal(source._serialToWarehouseValue(Number.NaN, DATA_TYPES.DATE), null);
  assert.equal(source._serialToWarehouseValue(3e6, DATA_TYPES.DATE), null);
});

test('creates an empty column the Output Schema declares as a date with that type', async () => {
  const formatted = [['Date', 'Closed'], ['10/1/2026'], ['10/2/2026']];
  const serial = [['Date', 'Closed'], [46296], [46297]];
  const formats = [[null, null], ['DATE'], ['DATE']];

  const { fields, rows } = await runDateSheet(
    { outputSchemaFieldTypes: JSON.stringify({ date: 'OTHER', closed: 'DATE' }) },
    { formatted, serial, formats }
  );

  assert.equal(fields.closed.type, DATA_TYPES.DATE);
  assert.deepEqual(columnOf(rows, 'closed'), [null, null]);
  assert.equal(fields.date.type, DATA_TYPES.STRING);

  // Without a declared type an empty column keeps the type inference gives it.
  const undeclared = await runDateSheet({}, { formatted, serial, formats });
  assert.equal(undeclared.fields.closed.type, DATA_TYPES.STRING);
});
