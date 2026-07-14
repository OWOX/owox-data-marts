import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

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

function loadScript(fileName, exportName, context) {
  const source = readFileSync(new URL(fileName, import.meta.url), 'utf8');
  const sandbox = vm.createContext({ console, ...context });
  vm.runInContext(`${source}\nglobalThis.__exportedClass = ${exportName};`, sandbox);
  return sandbox.__exportedClass;
}

const GoogleSheetsSource = loadScript(
  '../src/Sources/GoogleSheets/Source.js',
  'GoogleSheetsSource',
  {
    AbstractSource: class AbstractSource {},
    DATA_TYPES,
    HTTP_STATUS: {
      UNAUTHORIZED: 401,
      TOO_MANY_REQUESTS: 429,
      SERVER_ERROR_MIN: 500,
    },
    HttpRequestException,
  }
);

const GoogleSheetsConnector = loadScript(
  '../src/Sources/GoogleSheets/Connector.js',
  'GoogleSheetsConnector',
  {
    AbstractConnector: class AbstractConnector {},
  }
);

function createSource({
  headerRow = 1,
  range = '',
  importAllColumns = true,
  fields = 'sheet _owox_row_number',
  selectedColumns = '',
  inferTypes = true,
} = {}) {
  const logs = [];
  const source = Object.create(GoogleSheetsSource.prototype);
  source.config = {
    HeaderRow: { value: headerRow },
    Range: { value: range },
    SheetName: { value: 'Data' },
    SpreadsheetId: { value: 'spreadsheet-id' },
    ImportAllColumns: { value: importAllColumns },
    Fields: { value: fields },
    SelectedColumns: { value: selectedColumns },
    InferTypes: { value: inferTypes },
    MaxFetchRetries: { value: 3 },
    InitialRetryDelay: { value: 1 },
    logMessage(message) {
      logs.push(message);
    },
  };
  source.logs = logs;
  source.accessToken = null;
  source.tokenExpiryTime = null;
  return source;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

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

test('bounds an unconfigured preview to 256 columns and 100 sample rows', () => {
  const source = createSource({ headerRow: 4 });

  assert.equal(source._buildA1Range({ preview: true }), "'Data'!A4:IV104");
  assert.deepEqual(plain(source._parseA1GridRange('$B$5:$D$20')), {
    startColumn: 2,
    endColumn: 4,
    startRow: 5,
    endRow: 20,
  });
});

test('does not allow Range to override the selected sheet tab', () => {
  const sameSheetSource = createSource({ range: "'Data'!A:D" });
  assert.equal(sameSheetSource._buildA1Range(), "'Data'!A:D");

  const otherSheetSource = createSource({ range: "'Other'!A:D" });
  assert.throws(() => otherSheetSource._buildA1Range(), /Range must use the selected sheet 'Data'/);
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

test('preserves text whitespace exactly as returned by Google Sheets', () => {
  const source = createSource();
  const columns = source._buildColumnDefinitions(['Label']);
  const rows = source._buildRows([['  padded  '], ['   '], ['']], columns, 2);

  assert.deepEqual(
    plain(rows).map(row => [row._owox_row_number, row.label]),
    [
      [2, '  padded  '],
      [3, '   '],
    ]
  );
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

test('subset mode reads persisted selections independently from runtime Fields', () => {
  const source = createSource({
    importAllColumns: false,
    fields: 'sheet _owox_row_number, sheet existing',
    selectedColumns: '_owox_row_number,existing,temporarily_missing',
  });

  const missingSnapshot = source._buildSheetSnapshot([['Existing'], ['old']], true);
  assert.deepEqual(
    Array.from(missingSnapshot.columns, column => column.name),
    ['existing']
  );

  const returnedSnapshot = source._buildSheetSnapshot(
    [
      ['Existing', 'Temporarily Missing'],
      ['old', 'back'],
    ],
    true
  );
  assert.deepEqual(
    Array.from(returnedSnapshot.columns, column => column.name),
    ['existing', 'temporarily_missing']
  );
});

test('uses the persisted selected-columns subset and never writes unselected sheet columns', () => {
  const source = createSource({
    importAllColumns: 'false',
    fields: 'sheet _owox_row_number',
    selectedColumns: '_owox_row_number,campaign,spend',
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

test('does not map a missing generated column name to a newly named column at the same position', () => {
  const source = createSource({
    importAllColumns: false,
    selectedColumns: '_owox_row_number,product_keys,test1,column_5',
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
    sourceWithoutImportedAt._inferSchema(columns, rows, { includeImportedAt: true }),
    { includeTechnicalFieldsInDefaultFields: true }
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
  assert.equal(selectedSchema._owox_imported_at.type, DATA_TYPES.TIMESTAMP);
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
    return { getAsJson: async () => ({ values: [['Name']] }) };
  };

  assert.deepEqual(plain(await source._fetchSheetValues()), [['Name']]);
  assert.deepEqual(tokenCalls, [false, true]);
  assert.equal(source._getRetryAfterMs({ getHeaders: () => ({ 'Retry-After': '7' }) }), 7000);
});

test('connector always publishes empty snapshots and reports only the runtime schema fields', async () => {
  const connector = Object.create(GoogleSheetsConnector.prototype);
  const updates = [];
  const replacements = [];
  connector.config = {
    Fields: { value: 'sheet _owox_row_number, sheet _owox_imported_at, sheet name' },
    updateFields(fields) {
      updates.push(fields);
    },
    logMessage() {},
  };
  connector.source = {
    fieldsSchema: {
      sheet: {
        fields: {
          _owox_row_number: { type: DATA_TYPES.INTEGER },
          name: { type: DATA_TYPES.STRING },
        },
      },
    },
    fetchData: async () => [],
  };
  connector.getStorageByNode = async () => ({
    replaceData: async data => replacements.push(data),
  });

  await connector.startImportProcess();

  assert.deepEqual(plain(updates), [['_owox_row_number', 'name']]);
  assert.equal(connector.config.Fields.value, 'sheet _owox_row_number, sheet name');
  assert.deepEqual(replacements, [[]]);
});
