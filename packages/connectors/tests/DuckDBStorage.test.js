// packages/connectors/tests/DuckDBStorage.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { withBuildLock, buildBundle } from './buildBundleOnce.js';
import { buildCreateStagingTableSql, buildMergeSql } from '../src/Storages/DuckDB/duckdbSql.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

let OWOX;
let duckdb;

before(() => {
  // The storage class only runs inside the built CJS bundle. See
  // buildBundleOnce.js: a cross-process lock spans build+require so this
  // file's rebuild can never overlap (and lose dist/index.cjs to) a sibling
  // test file's own `npm run build`.
  withBuildLock(() => {
    buildBundle(pkgRoot);
    OWOX = require(path.join(pkgRoot, 'dist', 'index.cjs'));
    duckdb = require('@duckdb/node-api');
  });
});

function makeContext(dbPath, tableName, maxBuffer) {
  const { Core } = OWOX;
  return new Core.AbstractContext({
    source: { name: 'Test', config: {} },
    storage: {
      name: 'DuckDB',
      config: {
        DatabasePath: { value: dbPath },
        DestinationSchemaName: { value: 'main' },
        DestinationTableName: { value: tableName },
        MaxBufferSize: { value: maxBuffer },
        Fields: { value: `${tableName} id, ${tableName} name, ${tableName} amount` },
      },
    },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
}

async function readRows(dbPath, table) {
  const instance = await duckdb.DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll(`SELECT * FROM "main"."${table}" ORDER BY id`);
  return reader.getRowObjects();
}

// Like makeContext, but accepts an explicit column list so the `Fields`
// config param (parsed by AbstractStorage.getSelectedFields as comma-separated
// "<prefix> <fieldName>" pairs) selects an arbitrary set of typed columns
// instead of the fixed id/name/amount trio.
function makeContextFor(dbPath, tableName, maxBuffer, columns) {
  const { Core } = OWOX;
  const fields = columns.map(c => `${tableName} ${c}`).join(', ');
  return new Core.AbstractContext({
    source: { name: 'Test', config: {} },
    storage: {
      name: 'DuckDB',
      config: {
        DatabasePath: { value: dbPath },
        DestinationSchemaName: { value: 'main' },
        DestinationTableName: { value: tableName },
        MaxBufferSize: { value: maxBuffer },
        Fields: { value: fields },
      },
    },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
}

test('init + saveData writes typed rows and dedups by unique key', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-a.duckdb`);
  const ctx = makeContext(dbPath, 't_dedup', 2);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, 'desc');

  await storage.init();
  await storage.saveData([
    { id: 1, name: 'a', amount: 1.5 },
    { id: 2, name: 'b', amount: 2.5 },
    { id: 1, name: 'a2', amount: 9.9 }, // same key → update
  ]);

  const rows = await readRows(dbPath, 't_dedup');
  assert.equal(rows.length, 2);
  assert.equal(String(rows[0].name), 'a2');
  assert.equal(Number(rows[0].amount), 9.9);
  fs.rmSync(dbPath, { force: true });
});

test('saveData handles 10k rows exactly once', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-b.duckdb`);
  const ctx = makeContext(dbPath, 't_scale', 500);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);
  await storage.init();
  const data = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    name: `row-${i}`,
    amount: i / 2,
  }));
  await storage.saveData(data);

  const instance = await duckdb.DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll(`SELECT count(*) AS c FROM "main"."t_scale"`);
  assert.equal(Number(reader.getRowObjects()[0].c), 10000);
  fs.rmSync(dbPath, { force: true });
});

const RUN_SCHEMA = {
  id: { type: 'INTEGER' },
  name: { type: 'STRING' },
  amount: { type: 'NUMBER' },
};

// One connector run: its own instance, closed at the end like the child process exiting.
async function loadRun(
  dbPath,
  table,
  uniqueKeys,
  rows,
  { maxBuffer = 1000, schema = RUN_SCHEMA, columns = Object.keys(schema) } = {}
) {
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(
    makeContextFor(dbPath, table, maxBuffer, columns),
    uniqueKeys,
    schema,
    null
  );
  try {
    await storage.init();
    await storage.saveData(rows);
  } finally {
    storage._conn?.closeSync();
    storage._db?.closeSync();
  }
}

async function query(dbPath, sql) {
  const instance = await duckdb.DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  try {
    return (await connection.runAndReadAll(sql)).getRowObjects();
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

const idNameAmount = rows => rows.map(r => [r.id === null ? null : Number(r.id), r.name, r.amount]);

test('a second run updates the rows of the first instead of duplicating them', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-rerun.duckdb`);
  try {
    await loadRun(
      dbPath,
      't_rerun',
      ['id'],
      [
        { id: 1, name: 'a', amount: 1 },
        { id: 2, name: 'b', amount: 2 },
      ]
    );
    await loadRun(
      dbPath,
      't_rerun',
      ['id'],
      [
        { id: 2, name: 'b2', amount: 20 },
        { id: 3, name: 'c', amount: 3 },
      ]
    );

    const rows = await query(dbPath, 'SELECT * FROM "main"."t_rerun" ORDER BY id');
    assert.deepEqual(idNameAmount(rows), [
      [1, 'a', 1],
      [2, 'b2', 20],
      [3, 'c', 3],
    ]);
    assert.deepEqual(
      await query(
        dbPath,
        "SELECT constraint_type FROM duckdb_constraints() WHERE table_name = 't_rerun' AND constraint_type = 'PRIMARY KEY'"
      ),
      []
    );
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('a row whose INTEGER unique key is NULL is inserted, and a rerun updates it', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-nullint.duckdb`);
  try {
    await loadRun(
      dbPath,
      't_nullint',
      ['id'],
      [
        { id: null, name: 'no key', amount: 1 },
        { id: 1, name: 'a', amount: 2 },
      ]
    );
    await loadRun(dbPath, 't_nullint', ['id'], [{ id: null, name: 'no key again', amount: 10 }]);

    const rows = await query(dbPath, 'SELECT * FROM "main"."t_nullint" ORDER BY id NULLS LAST');
    assert.deepEqual(idNameAmount(rows), [
      [1, 'a', 2],
      [null, 'no key again', 10],
    ]);
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test("a row whose STRING unique key is NULL stays NULL, apart from '', and a rerun updates it", async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-nullstr.duckdb`);
  try {
    await loadRun(
      dbPath,
      't_nullstr',
      ['name'],
      [
        { id: 1, name: 'US', amount: 1 },
        { id: 2, name: null, amount: 2 },
        { id: 3, name: '', amount: 3 },
      ]
    );
    await loadRun(dbPath, 't_nullstr', ['name'], [{ id: 20, name: null, amount: 20 }]);

    const rows = await query(dbPath, 'SELECT * FROM "main"."t_nullstr" ORDER BY name NULLS LAST');
    assert.deepEqual(idNameAmount(rows), [
      [3, '', 3],
      [1, 'US', 1],
      [20, null, 20],
    ]);
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test("a run with different unique keys than the table's first run still upserts", async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-rekey.duckdb`);
  try {
    await loadRun(dbPath, 't_rekey', ['id'], [{ id: 1, name: 'a', amount: 1 }]);
    await loadRun(
      dbPath,
      't_rekey',
      ['id', 'name'],
      [
        { id: 1, name: 'a', amount: 10 },
        { id: 1, name: 'b', amount: 2 },
      ]
    );

    const rows = await query(dbPath, 'SELECT * FROM "main"."t_rekey" ORDER BY id, name');
    assert.deepEqual(idNameAmount(rows), [
      [1, 'a', 10],
      [1, 'b', 2],
    ]);
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('a column added to the node between two runs is written by the MERGE', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-addcol.duckdb`);
  try {
    await loadRun(dbPath, 't_addcol', ['id'], [{ id: 1, name: 'a' }], { columns: ['id', 'name'] });
    await loadRun(
      dbPath,
      't_addcol',
      ['id'],
      [
        { id: 1, name: 'a2', amount: 10 },
        { id: 2, name: 'b', amount: 2 },
      ]
    );

    const rows = await query(dbPath, 'SELECT * FROM "main"."t_addcol" ORDER BY id');
    assert.deepEqual(idNameAmount(rows), [
      [1, 'a2', 10],
      [2, 'b', 2],
    ]);
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('upserts into a table created with a PRIMARY KEY by an earlier build', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-oldpk.duckdb`);
  try {
    await query(
      dbPath,
      'CREATE TABLE "main"."t_oldpk" ("id" BIGINT, "name" VARCHAR, "amount" DOUBLE, PRIMARY KEY ("id"))'
    );
    await loadRun(dbPath, 't_oldpk', ['id'], [{ id: 1, name: 'a', amount: 1 }]);
    await loadRun(
      dbPath,
      't_oldpk',
      ['id'],
      [
        { id: 1, name: 'a2', amount: 10 },
        { id: 2, name: 'b', amount: 2 },
      ]
    );

    // '03' and 3 are two buffer entries that bind to one key: one row, not a key violation.
    await loadRun(
      dbPath,
      't_oldpk',
      ['id'],
      [
        { id: 3, name: 'c', amount: 3 },
        { id: '03', name: 'c2', amount: 30 },
      ]
    );

    const rows = await query(dbPath, 'SELECT * FROM "main"."t_oldpk" ORDER BY id');
    assert.deepEqual(idNameAmount(rows), [
      [1, 'a2', 10],
      [2, 'b', 2],
      [3, 'c2', 30],
    ]);
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('of two rows in one flush whose keys bind to the same value, the last one wins', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-lastwins.duckdb`);
  try {
    await loadRun(
      dbPath,
      't_lastwins',
      ['id'],
      [
        { id: 1, name: 'first', amount: 1 },
        { id: '01', name: 'last', amount: 2 },
      ]
    );
    assert.deepEqual(
      idNameAmount(await query(dbPath, 'SELECT * FROM "main"."t_lastwins" ORDER BY id')),
      [[1, 'last', 2]]
    );

    await loadRun(
      dbPath,
      't_lastwins',
      ['id'],
      [
        { id: '01', name: 'first again', amount: 3 },
        { id: 1, name: 'last again', amount: 4 },
      ]
    );
    assert.deepEqual(
      idNameAmount(await query(dbPath, 'SELECT * FROM "main"."t_lastwins" ORDER BY id')),
      [[1, 'last again', 4]]
    );
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('a node field named rowid does not change which of two rows with one key wins', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-rowid.duckdb`);
  const schema = { id: { type: 'INTEGER' }, rowid: { type: 'INTEGER' }, name: { type: 'STRING' } };
  try {
    await loadRun(
      dbPath,
      't_rowid',
      ['id'],
      [
        { id: 1, rowid: 2, name: 'first' },
        { id: '01', rowid: 1, name: 'last' },
      ],
      { schema }
    );

    assert.deepEqual(
      await query(
        dbPath,
        'SELECT id::INTEGER AS id, "rowid"::INTEGER AS r, name FROM "main"."t_rowid"'
      ),
      [{ id: 1, r: 1, name: 'last' }]
    );
    assert.deepEqual(
      (
        await query(
          dbPath,
          "SELECT column_name FROM information_schema.columns WHERE table_name = 't_rowid' ORDER BY ordinal_position"
        )
      ).map(r => r.column_name),
      ['id', 'rowid', 'name']
    );
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test(
  'loads and then reloads 20,000 rows in one flush within seconds',
  { timeout: 5000 },
  async () => {
    const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-20k.duckdb`);
    try {
      const rows = Array.from({ length: 20000 }, (_, i) => ({
        id: i,
        name: `row-${i}`,
        amount: i,
      }));
      await loadRun(dbPath, 't_20k', ['id'], rows, { maxBuffer: 20000 });
      await loadRun(
        dbPath,
        't_20k',
        ['id'],
        rows.map(r => ({ ...r, amount: -r.amount })),
        { maxBuffer: 20000 }
      );

      assert.deepEqual(
        await query(
          dbPath,
          'SELECT count(*)::INTEGER AS c, sum(amount)::BIGINT AS s FROM "main"."t_20k"'
        ),
        [{ c: 20000, s: -199990000n }]
      );
    } finally {
      for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
    }
  }
);

test('the MERGE matches its keys, NULL-safe, with a hash join', async () => {
  const instance = await duckdb.DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  try {
    await connection.run('CREATE TABLE "main"."t" ("id" BIGINT, "day" DATE, "name" VARCHAR)');
    await connection.run(
      buildCreateStagingTableSql({
        table: 'stage',
        columns: ['id', 'day', 'name'],
        columnTypes: { id: 'INTEGER', day: 'DATE', name: 'STRING' },
      })
    );
    const sql = buildMergeSql({
      schema: 'main',
      table: 't',
      staging: 'stage',
      columns: ['id', 'day', 'name'],
      uniqueKeys: ['id', 'day'],
    });
    const plan = (await connection.runAndReadAll(`EXPLAIN ${sql}`)).getRowObjects();
    assert.match(JSON.stringify(plan), /Hash Join/);
    assert.doesNotMatch(JSON.stringify(plan), /Nested Loop Join|Blockwise Nl Join/);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

test('emits rows_written analytics per batch', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-c.duckdb`);
  const ctx = makeContext(dbPath, 't_rw', 2);
  const seen = [];
  const orig = ctx.emitAnalytics?.bind(ctx);
  ctx.emitAnalytics = (metric, value, tags) => {
    if (metric === 'rows_written') seen.push(value);
    if (orig) return orig(metric, value, tags);
  };
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);
  await storage.init();
  await storage.saveData([
    { id: 1, name: 'a', amount: 1 },
    { id: 2, name: 'b', amount: 2 },
    { id: 3, name: 'c', amount: 3 },
  ]);
  assert.ok(seen.length >= 1);
  assert.equal(seen.reduce((s, n) => s + n, 0) >= 3, true);
  fs.rmSync(dbPath, { force: true });
});

test('saveData round-trips BOOLEAN/DATE/TIMESTAMP/TIME/ARRAY/OBJECT, including nulls', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-types.duckdb`);
  const tableName = 't_types';
  const columns = ['id', 'flag', 'd', 'ts', 'tm', 'arr', 'obj'];
  const ctx = makeContextFor(dbPath, tableName, 10, columns);
  const schema = {
    id: { type: 'INTEGER' },
    flag: { type: 'BOOLEAN' },
    d: { type: 'DATE' },
    ts: { type: 'TIMESTAMP' },
    tm: { type: 'TIME' },
    arr: { type: 'ARRAY' },
    obj: { type: 'OBJECT' },
  };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);
  await storage.init();

  const dValue = new Date('2024-03-15T00:00:00.000Z');
  const tsValue = new Date('2024-03-15T13:45:30.123Z');

  await storage.saveData([
    {
      id: 1,
      flag: true,
      d: dValue,
      ts: tsValue,
      tm: '07:08:09',
      arr: ['a', 'b', 'c'],
      obj: { a: 1, b: 'x' },
    },
    // Distinct id (not 1) so this doesn't collide with the row above under
    // the id unique key — it's a separate row asserting every non-key
    // column reads back as null, not an update of the typed row.
    {
      id: 2,
      flag: null,
      d: null,
      ts: null,
      tm: null,
      arr: null,
      obj: null,
    },
  ]);

  const rows = await readRows(dbPath, tableName);
  assert.equal(rows.length, 2);
  const [typed, nulled] = rows;

  // bigint (BIGINT) and boolean read back as native JS values.
  assert.equal(Number(typed.id), 1);
  assert.equal(typed.flag, true);

  // DATE/TIMESTAMP/TIME read back as DuckDBValue wrapper objects exposing
  // toParts() — assert the actual instant/time-of-day, not just presence.
  assert.deepEqual(typed.d.toParts(), { year: 2024, month: 3, day: 15 });
  assert.deepEqual(typed.ts.toParts(), {
    date: { year: 2024, month: 3, day: 15 },
    time: { hour: 13, min: 45, sec: 30, micros: 123000 },
  });
  assert.deepEqual(typed.tm.toParts(), { hour: 7, min: 8, sec: 9, micros: 0 });

  // ARRAY/OBJECT are stored as VARCHAR columns holding JSON text.
  assert.deepEqual(JSON.parse(typed.arr), ['a', 'b', 'c']);
  assert.deepEqual(JSON.parse(typed.obj), { a: 1, b: 'x' });

  assert.equal(Number(nulled.id), 2);
  assert.equal(nulled.flag, null);
  assert.equal(nulled.d, null);
  assert.equal(nulled.ts, null);
  assert.equal(nulled.tm, null);
  assert.equal(nulled.arr, null);
  assert.equal(nulled.obj, null);

  fs.rmSync(dbPath, { force: true });
});

test('saveData coerces a non-numeric INTEGER value to null instead of crashing on BigInt(NaN)', async () => {
  // Regression (prod-smoke): RedditAds ad-group/campaigns delivered an
  // integer-typed field whose value was non-numeric for some accounts, so
  // BigInt(Math.trunc(Number('N/A'))) === BigInt(NaN) threw and aborted the
  // whole account. A garbage numeric should degrade to NULL, not crash.
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-nan.duckdb`);
  const tableName = 't_nan';
  const columns = ['id', 'count'];
  const ctx = makeContextFor(dbPath, tableName, 10, columns);
  const schema = { id: { type: 'INTEGER' }, count: { type: 'INTEGER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);
  await storage.init();

  await storage.saveData([
    { id: 1, count: 42 },
    { id: 2, count: 'N/A' }, // non-numeric → NaN → must land as NULL, not throw
  ]);

  const rows = await readRows(dbPath, tableName);
  assert.equal(rows.length, 2);
  assert.equal(Number(rows[0].count), 42);
  assert.equal(rows[1].count, null);
  fs.rmSync(dbPath, { force: true });
});

test('saveData binds an INTEGER string beyond 2^53 exactly', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-bigint.duckdb`);
  const schema = { id: { type: 'INTEGER' }, n: { type: 'INTEGER' } };
  try {
    await loadRun(
      dbPath,
      't_bigint',
      ['id'],
      [
        { id: '9007199254740993', n: '-9223372036854775808' },
        { id: '9007199254740992', n: 42 },
      ],
      { schema }
    );

    assert.deepEqual(
      await query(
        dbPath,
        'SELECT id::VARCHAR AS id, n::VARCHAR AS n FROM "main"."t_bigint" ORDER BY id'
      ),
      [
        { id: '9007199254740992', n: '42' },
        { id: '9007199254740993', n: '-9223372036854775808' },
      ]
    );
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('an INTEGER beyond the BIGINT range fails the load, naming the column and the value', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-bigrange.duckdb`);
  const schema = { id: { type: 'INTEGER' }, n: { type: 'INTEGER' } };
  try {
    await assert.rejects(
      loadRun(dbPath, 't_bigrange', ['id'], [{ id: 1, n: '9223372036854775808' }], { schema }),
      {
        message:
          'DuckDBStorage: INTEGER value "9223372036854775808" in column "n" is outside the BIGINT range',
      }
    );
    await assert.rejects(loadRun(dbPath, 't_bigrange', ['id'], [{ id: 2, n: 1e20 }], { schema }), {
      message:
        'DuckDBStorage: INTEGER value "100000000000000000000" in column "n" is outside the BIGINT range',
    });
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('saveData binds an Invalid Date as NULL instead of aborting the load', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-baddate.duckdb`);
  const schema = {
    id: { type: 'INTEGER' },
    d: { type: 'DATE' },
    ts: { type: 'TIMESTAMP' },
    s: { type: 'STRING' },
  };
  try {
    await loadRun(
      dbPath,
      't_baddate',
      ['id'],
      [
        { id: 1, d: new Date('not a date'), ts: 'not a timestamp', s: new Date(NaN) },
        { id: 2, d: 'not a date', ts: new Date(NaN), s: 'kept' },
      ],
      { schema }
    );

    assert.deepEqual(await query(dbPath, 'SELECT * FROM "main"."t_baddate" ORDER BY id'), [
      { id: 1n, d: null, ts: null, s: null },
      { id: 2n, d: null, ts: null, s: 'kept' },
    ]);
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('saveData throws on an unparseable TIME value instead of silently corrupting to midnight', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-timeerr.duckdb`);
  const tableName = 't_time_err';
  const columns = ['id', 'tm'];
  const ctx = makeContextFor(dbPath, tableName, 10, columns);
  const schema = { id: { type: 'INTEGER' }, tm: { type: 'TIME' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);
  await storage.init();

  await assert.rejects(
    () => storage.saveData([{ id: 1, tm: 'not-a-time' }]),
    err => {
      assert.match(err.message, /cannot parse TIME value "not-a-time"/);
      return true;
    }
  );

  fs.rmSync(dbPath, { force: true });
});

// The connector process never closes the file, so committed rows would stay in
// the .wal file and a backup of the .duckdb file alone would miss them.
test('saveData and replaceData leave their rows in the main file, not only in the WAL', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-ckpt.duckdb`);
  const copyPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-ckpt-copy.duckdb`);
  const ctx = makeContext(dbPath, 't_ckpt', 1000);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);

  try {
    await storage.init();
    await storage.saveData([{ id: 1, name: 'saved', amount: 1 }]);
    fs.copyFileSync(dbPath, copyPath);
    assert.deepEqual(
      (await readRows(copyPath, 't_ckpt')).map(r => String(r.name)),
      ['saved']
    );

    await storage.replaceData([{ id: 2, name: 'replaced', amount: 2 }]);
    fs.rmSync(copyPath, { force: true });
    fs.copyFileSync(dbPath, copyPath);
    assert.deepEqual(
      (await readRows(copyPath, 't_ckpt')).map(r => String(r.name)),
      ['replaced']
    );
  } finally {
    for (const file of [dbPath, `${dbPath}.wal`, copyPath]) fs.rmSync(file, { force: true });
  }
});

// ---- full-refresh snapshot publication -----------------------------------
// The point of replaceData over saveData: an upsert can only add and update,
// so a row deleted upstream would live on downstream forever.

test('replaceData drops rows that disappeared from the source', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-snap.duckdb`);
  const ctx = makeContext(dbPath, 't_snapshot', 1000);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, 'desc');

  await storage.init();
  await storage.saveData([
    { id: 1, name: 'kept', amount: 1 },
    { id: 2, name: 'removed-upstream', amount: 2 },
  ]);

  await storage.replaceData([{ id: 1, name: 'kept', amount: 10 }]);

  const rows = await readRows(dbPath, 't_snapshot');
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].id), 1);
  assert.equal(Number(rows[0].amount), 10);
  fs.rmSync(dbPath, { force: true });
});

// An empty source is the case that matters most: it is exactly when every row
// must go, and exactly when a "skip the write if there is no data" guard would
// silently leave the previous snapshot in place.
test('replaceData publishes an empty snapshot', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-empty.duckdb`);
  const ctx = makeContext(dbPath, 't_empty', 1000);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);

  await storage.init();
  await storage.saveData([{ id: 1, name: 'stale', amount: 1 }]);

  await storage.replaceData([]);

  assert.deepEqual(await readRows(dbPath, 't_empty'), []);
  fs.rmSync(dbPath, { force: true });
});

test('replaceData creates the table when the destination does not exist yet', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-fresh.duckdb`);
  const ctx = makeContext(dbPath, 't_fresh', 1000);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);

  await storage.replaceData([{ id: 7, name: 'first', amount: 3 }]);

  const rows = await readRows(dbPath, 't_fresh');
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].name), 'first');
  fs.rmSync(dbPath, { force: true });
});

// A failed publication must leave the previous snapshot intact and take its
// staging table with it, rather than half-replacing the live one.
test('replaceData leaves the live table untouched when the load fails', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-fail.duckdb`);
  const ctx = makeContext(dbPath, 't_fail', 1000);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);

  await storage.init();
  await storage.saveData([{ id: 1, name: 'survivor', amount: 1 }]);

  const realSaveData = storage.saveData.bind(storage);
  storage.saveData = async () => {
    throw new Error('load failed');
  };
  await assert.rejects(storage.replaceData([{ id: 2, name: 'never', amount: 2 }]), /load failed/);
  storage.saveData = realSaveData;

  const rows = await readRows(dbPath, 't_fail');
  assert.equal(rows.length, 1);
  assert.equal(String(rows[0].name), 'survivor');

  const instance = await duckdb.DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  const leftovers = await connection.runAndReadAll(
    "SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%__owox_stage_%'"
  );
  assert.deepEqual(leftovers.getRowObjects(), []);
  fs.rmSync(dbPath, { force: true });
});

test('opens the file within a quarter of the memory, half of the cores and 10GB of spill', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-limits.duckdb`);
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(
    makeContext(dbPath, 't_limits', 10),
    ['id'],
    { id: { type: 'INTEGER' } },
    null
  );
  try {
    await storage._openDatabase();
    const reader = await storage._conn.runAndReadAll(
      "SELECT current_setting('threads') AS threads, current_setting('max_temp_directory_size') AS temp"
    );
    const [settings] = reader.getRowObjects();
    assert.equal(Number(settings.threads), Math.max(1, Math.floor(os.availableParallelism() / 2)));
    assert.equal(settings.temp, '9.3 GiB');
  } finally {
    storage._conn?.closeSync();
    storage._db?.closeSync();
    fs.rmSync(dbPath, { force: true });
  }
});

test('takes the quarter of the memory from a lower container memory limit', async t => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-cap.duckdb`);
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(
    makeContext(dbPath, 't_cap', 10),
    ['id'],
    { id: { type: 'INTEGER' } },
    null
  );
  t.mock.method(process, 'constrainedMemory', () => 2e9);
  try {
    await storage._openDatabase();
    const reader = await storage._conn.runAndReadAll(
      "SELECT current_setting('memory_limit') AS memory"
    );
    assert.deepEqual(reader.getRowObjects(), [{ memory: '476.8 MiB' }]);
  } finally {
    storage._conn?.closeSync();
    storage._db?.closeSync();
    fs.rmSync(dbPath, { force: true });
  }
});

test('creates a missing data directory before the first open', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-dir-'));
  const dbPath = path.join(dir, 'missing', 'data', 'st.duckdb');
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(
    makeContext(dbPath, 't_dir', 10),
    ['id'],
    { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } },
    null
  );
  try {
    await storage.init();
    assert.equal(fs.existsSync(dbPath), true);
  } finally {
    storage._conn?.closeSync();
    storage._db?.closeSync();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed COMMIT surfaces its own error, not the ROLLBACK that follows it', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-commit.duckdb`);
  const schema = { id: { type: 'INTEGER' }, name: { type: 'STRING' }, amount: { type: 'NUMBER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(
    makeContext(dbPath, 't_commit', 10),
    ['id'],
    schema,
    null
  );
  let conn;
  try {
    await storage.init();
    conn = storage._conn;
    // DuckDB ends the transaction when a COMMIT fails, so the ROLLBACK after it fails too.
    storage._conn = {
      run: sql =>
        sql === 'COMMIT'
          ? conn.run('ROLLBACK').then(() => Promise.reject(new Error('commit failed')))
          : conn.run(sql),
      runAndReadAll: sql => conn.runAndReadAll(sql),
      createAppender: (...args) => conn.createAppender(...args),
    };

    await assert.rejects(storage.saveData([{ id: 1, name: 'a', amount: 1 }]), /commit failed/);
    await assert.rejects(storage.replaceData([]), /commit failed/);
  } finally {
    (conn ?? storage._conn)?.closeSync();
    storage._db?.closeSync();
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

test('opens the file in UTC with the configuration locked', async () => {
  const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-utc.duckdb`);
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(
    makeContext(dbPath, 't_utc', 10),
    ['id'],
    { id: { type: 'INTEGER' } },
    null
  );
  try {
    await storage._openDatabase();
    const reader = await storage._conn.runAndReadAll("SELECT current_setting('TimeZone') AS tz");
    assert.deepEqual(reader.getRowObjects(), [{ tz: 'UTC' }]);
    await assert.rejects(
      storage._conn.run("SET TimeZone = 'Europe/Kyiv'"),
      /configuration has been locked/
    );
  } finally {
    storage._conn?.closeSync();
    storage._db?.closeSync();
    for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
  }
});

// One child process per zone; tstz stands for a TIMESTAMPTZ column added to the table by hand.
const LOAD_IN_HOST_ZONE = `
const [bundle, dbPath] = process.argv.slice(1);
const OWOX = require(bundle);
const duckdb = require('@duckdb/node-api');
(async () => {
  const instance = await duckdb.DuckDBInstance.create(dbPath);
  const connection = await instance.connect();
  await connection.run('CREATE TABLE main.t_tz (id BIGINT, ts TIMESTAMP, d DATE, tstz TIMESTAMPTZ)');
  connection.closeSync();
  instance.closeSync();
  const context = new OWOX.Core.AbstractContext({
    source: { name: 'Test', config: {} },
    storage: {
      name: 'DuckDB',
      config: {
        DatabasePath: { value: dbPath },
        DestinationTableName: { value: 't_tz' },
        Fields: { value: 't_tz id, t_tz ts, t_tz d, t_tz tstz' },
      },
    },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
  const schema = { id: { type: 'INTEGER' }, ts: { type: 'TIMESTAMP' }, d: { type: 'DATE' }, tstz: { type: 'TIMESTAMP' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(context, ['id'], schema, null);
  await storage.init();
  await storage.saveData([
    { id: 1, ts: new Date('2024-03-15T10:00:00Z'), d: new Date('2024-03-15T00:00:00Z'), tstz: new Date('2024-03-15T10:00:00Z') },
    { id: 2, ts: '2024-03-15T10:00:00+02:00', d: '2024-03-15', tstz: '2024-03-15T10:00:00+02:00' },
    { id: 3, ts: '2024-03-15T23:30:00-05:00', d: '2024-03-15T23:30:00-05:00', tstz: '2024-03-15T23:30:00-05:00' },
    { id: 4, ts: '2024-03-15 10:00:00', d: '2024-03-15T23:30:00', tstz: '2024-03-15T10:00:00' },
    { id: 5, ts: '03/15/2024 10:00:00', d: '03/15/2024', tstz: '03/15/2024 10:00:00' },
  ]);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
`;

test('loads the same values whatever the host time zone, zone-less strings as UTC', async () => {
  const loaded = {};
  for (const zone of ['Europe/Kyiv', 'America/Los_Angeles']) {
    const dbPath = path.join(os.tmpdir(), `duck-${process.pid}-${Date.now()}-tz.duckdb`);
    try {
      // The lock keeps a sibling test file from rebuilding dist/ while the child requires it.
      withBuildLock(() =>
        execFileSync(
          process.execPath,
          ['-e', LOAD_IN_HOST_ZONE, path.join(pkgRoot, 'dist', 'index.cjs'), dbPath],
          {
            cwd: pkgRoot,
            env: { ...process.env, TZ: zone },
            stdio: ['ignore', 'ignore', 'inherit'],
          }
        )
      );
      loaded[zone] = await query(
        dbPath,
        `SELECT id::INTEGER AS id, ts::VARCHAR AS ts, d::VARCHAR AS d,
                (tstz AT TIME ZONE 'UTC')::VARCHAR AS tstz_utc
         FROM "main"."t_tz" ORDER BY id`
      );
    } finally {
      for (const file of [dbPath, `${dbPath}.wal`]) fs.rmSync(file, { force: true });
    }
  }

  assert.deepEqual(loaded['America/Los_Angeles'], loaded['Europe/Kyiv']);
  assert.deepEqual(loaded['Europe/Kyiv'], [
    { id: 1, ts: '2024-03-15 10:00:00', d: '2024-03-15', tstz_utc: '2024-03-15 10:00:00' },
    { id: 2, ts: '2024-03-15 08:00:00', d: '2024-03-15', tstz_utc: '2024-03-15 08:00:00' },
    { id: 3, ts: '2024-03-16 04:30:00', d: '2024-03-16', tstz_utc: '2024-03-16 04:30:00' },
    { id: 4, ts: '2024-03-15 10:00:00', d: '2024-03-15', tstz_utc: '2024-03-15 10:00:00' },
    { id: 5, ts: '2024-03-15 10:00:00', d: '2024-03-15', tstz_utc: '2024-03-15 10:00:00' },
  ]);
});

function makeLockTestStorage(create) {
  const dbPath = path.join(os.tmpdir(), `duckdb-lock-${process.pid}-${Date.now()}.duckdb`);
  const ctx = makeContext(dbPath, 't_lock', 10);
  const schema = { id: { type: 'INTEGER' } };
  const storage = new OWOX.Storages.DuckDB.DuckDBStorage(ctx, ['id'], schema, null);
  const sleeps = [];
  storage._sleep = async ms => {
    sleeps.push(ms);
  };
  storage._duck = { DuckDBInstance: { create } };
  return { storage, sleeps };
}

test('retries a lock-conflict open', async () => {
  let calls = 0;
  const create = async () => {
    calls++;
    if (calls <= 2) throw new Error('Conflicting lock is held');
    return { connect: async () => ({ run: async () => {} }) };
  };
  const { storage, sleeps } = makeLockTestStorage(create);
  await storage._openDatabase();
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [100, 200]);
});

test('gives up on a held lock after 13 attempts with the backend lock schedule', async () => {
  let calls = 0;
  const lockError = new Error('IO Error: Could not set lock on file: Conflicting lock is held');
  const create = async () => {
    calls++;
    throw lockError;
  };
  const { storage, sleeps } = makeLockTestStorage(create);
  await assert.rejects(storage._openDatabase(), error => error === lockError);
  assert.equal(calls, 13);
  // withDuckDbLockRetry in the backend: 100 ms doubling, capped at 4000 ms, 30,300 ms in all.
  assert.deepEqual(sleeps, [100, 200, 400, 800, 1600, 3200, 4000, 4000, 4000, 4000, 4000, 4000]);
});

test('closes the instance and keeps no connection when the UTC setup fails', async () => {
  const closed = [];
  const create = async () => ({
    connect: async () => ({
      run: async sql => {
        if (sql.startsWith('SET GLOBAL TimeZone')) throw new Error('set failed');
      },
      closeSync: () => closed.push('connection'),
    }),
    closeSync: () => closed.push('instance'),
  });
  const { storage } = makeLockTestStorage(create);

  await assert.rejects(storage._openDatabase(), /set failed/);
  assert.deepEqual(closed, ['connection', 'instance']);
  assert.equal(storage._conn, null);
  assert.equal(storage._db, null);
});

test('does not retry a non-lock open error', async () => {
  let calls = 0;
  const create = async () => {
    calls++;
    throw new Error('IO Error: No such file');
  };
  const { storage, sleeps } = makeLockTestStorage(create);
  await assert.rejects(storage._openDatabase(), /No such file/);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});
