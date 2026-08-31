import test from 'node:test';
import assert from 'node:assert/strict';
import { TestStorage, TEST_ROW_MARKER } from '../../src/Core/TestStorage.js';
import { AbstractConnector } from '../../src/Core/AbstractConnector.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

test('TestStorage.saveData writes one marker-prefixed NDJSON line per record', async () => {
  const lines = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = chunk => {
    lines.push(String(chunk));
    return true;
  };
  try {
    const s = new TestStorage({}, ['id'], { id: {} }, 'dest');
    await s.init();
    await s.saveData([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
  } finally {
    process.stdout.write = original;
  }
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith(TEST_ROW_MARKER));
  assert.deepEqual(JSON.parse(lines[0].slice(TEST_ROW_MARKER.length)), { id: 1, name: 'a' });
  assert.deepEqual(JSON.parse(lines[1].slice(TEST_ROW_MARKER.length)), { id: 2, name: 'b' });
});

// Note: there is no src/index.js — the package uses a vite-based build (vite.config.js)
// that auto-discovers all src/Core/**/*.js files and assembles the Core object at build time.
// TestStorage and TEST_ROW_MARKER are automatically included in Core by that mechanism.
// We verify the named exports exist in the module itself.
test('TestStorage and TEST_ROW_MARKER are named exports of the Core module', async () => {
  const mod = await import('../../src/Core/TestStorage.js');
  assert.ok(mod.TestStorage, 'TestStorage should be a named export');
  assert.equal(typeof mod.TEST_ROW_MARKER, 'string', 'TEST_ROW_MARKER should be a string export');
  assert.equal(mod.TEST_ROW_MARKER, TEST_ROW_MARKER);
});

// --- the connector-facing storage contract -------------------------------
//
// The builder's live test is not a mock harness: connector-runner hands the
// REAL AbstractConnector a real Source and TestStorage as its StorageClass. So
// the surface AbstractConnector calls on a storage -- init(), saveData(),
// replaceData() -- is TestStorage's contract, and the tests below drive it
// through the connector rather than calling its methods directly. Every other
// test in this repo builds its own mock storage class (see
// createMockStorageClass in tests/AbstractConnector.test.js), which is exactly
// how a missing method stayed invisible: the mocks implemented replaceData,
// the real TestStorage did not.

function runWithTestStorage(source, sourceConfig = {}) {
  const ctx = new AbstractContext({
    source: { name: 'TestSource', config: sourceConfig },
    storage: { name: 'TestStorage', config: {} },
    runConfig: {},
    env: { datamartId: 'dm-1', runId: 'run-1' },
  });
  const connector = new AbstractConnector(ctx, source, TestStorage);

  // The connector emits its control/log events on the same stdout TestStorage
  // writes rows to; keep only the marker lines.
  const written = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = chunk => {
    written.push(String(chunk));
    return true;
  };
  return connector
    .run()
    .then(() => ({
      rows: written
        .filter(line => line.startsWith(TEST_ROW_MARKER))
        .map(line => JSON.parse(line.slice(TEST_ROW_MARKER.length))),
    }))
    .finally(() => {
      process.stdout.write = original;
    });
}

// `uniqueKeys: []` is the realistic shape, not a shortcut: a full-refresh node
// replaces its whole table, so it has no merge key to declare, and
// DeclarativeSource._compileNodes defaults uniqueKeys to [] for exactly this
// case. It also pins down the fix -- a TestStorage that inherited
// AbstractStorage's constructor would reject this node outright, because that
// constructor throws when uniqueKeyColumns is empty.
function fullRefreshSource(rows) {
  return {
    fieldsSchema: {
      sheet: {
        fields: { id: { type: 'INTEGER' }, name: { type: 'STRING' } },
        uniqueKeys: [],
        isFullRefresh: true,
        destinationName: 'sheet',
      },
    },
    parseFields: () => ({ sheet: ['id', 'name'] }),
    getAccounts: () => [null],
    getDateStrategy: () => 'day-by-day',
    getDestinationName: (name, schema) => schema?.destinationName || name,
    fetchData: async () => rows,
    onAccountComplete: () => {},
    onAccountError: () => {},
    onImportComplete: () => {},
  };
}

test('a live test of a full-refresh node returns its sample rows', async () => {
  const { rows } = await runWithTestStorage(
    fullRefreshSource([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ])
  );
  assert.deepEqual(rows, [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
  ]);
});

test('a full-refresh node that fetched nothing still completes the live test', async () => {
  // processFullRefreshNode publishes the empty snapshot rather than skipping
  // the write (CreateEmptyTables is not false here), so replaceData([]) is
  // reached even when the test returns no rows at all.
  const { rows } = await runWithTestStorage(fullRefreshSource([]));
  assert.deepEqual(rows, []);
});

test('a live test of a catalog node returns its sample rows', async () => {
  // The other half of the contract: catalog/time-series nodes reach storage
  // through init() + saveData() instead.
  const source = fullRefreshSource([{ id: 7, name: 'c' }]);
  source.fieldsSchema.sheet.isFullRefresh = false;
  source.fieldsSchema.sheet.uniqueKeys = ['id'];
  const { rows } = await runWithTestStorage(source);
  assert.deepEqual(rows, [{ id: 7, name: 'c' }]);
});
