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
