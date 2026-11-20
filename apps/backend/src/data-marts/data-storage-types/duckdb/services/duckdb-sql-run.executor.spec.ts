import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DuckDbSqlRunExecutor } from './duckdb-sql-run.executor';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckDbApiAdapter } from '../adapters/duckdb-api.adapter';
import { DuckDbQueryBuilder } from './duckdb-query.builder';
import { DuckDbClauseRenderer } from './duckdb-clause-renderer';
import {
  createProductionDuckDbInstance,
  readSerializedRows,
} from '../__fixtures__/production-duckdb-instance';

it('streams rows for an explicit SQL as SqlRunBatch pages with columns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-run-'));
  const storageId = 'st-run-1';
  const dbPath = path.join(dir, `${storageId}.duckdb`);
  const inst = await createProductionDuckDbInstance(dbPath);
  const conn = await inst.connect();
  await conn.run('CREATE TABLE main."t"(id BIGINT, name VARCHAR)');
  await conn.run(`INSERT INTO main."t" VALUES (1,'a'), (2,'b')`);
  conn.closeSync?.();
  inst.closeSync?.();

  const executor = new DuckDbSqlRunExecutor(
    new DuckDbApiAdapterFactory(),
    new DuckDbQueryBuilder(new DuckDbClauseRenderer())
  );
  const rows: Record<string, unknown>[] = [];
  let columns: string[] | null | undefined;
  for await (const batch of executor.execute(
    { databasePath: dbPath },
    {} as never,
    {} as never,
    'SELECT id, name FROM main."t" ORDER BY id'
  )) {
    rows.push(...batch.rows);
    columns = batch.columns;
  }
  expect(columns).toEqual(['id', 'name']);
  expect(rows).toEqual([
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
  ]); // bigint id → Number via serializeDuckDbValue
  fs.rmSync(dir, { recursive: true, force: true });
});

it('reads a zero batch size as the default instead of emitting empty batches', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-run-'));
  const dbPath = path.join(dir, 'st-run-zero.duckdb');
  const inst = await createProductionDuckDbInstance(dbPath);
  const conn = await inst.connect();
  await conn.run('CREATE TABLE main.t AS SELECT range AS id FROM range(3)');
  conn.closeSync();
  inst.closeSync();
  const executor = new DuckDbSqlRunExecutor(
    new DuckDbApiAdapterFactory(),
    new DuckDbQueryBuilder(new DuckDbClauseRenderer())
  );

  try {
    for await (const batch of executor.execute(
      { databasePath: dbPath },
      {} as never,
      {} as never,
      'SELECT id FROM main.t',
      { maxRowsPerBatch: 0 }
    )) {
      expect(batch.rows).toHaveLength(3);
      break;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function runThroughExecutor(sql: string): Promise<Record<string, unknown>[]> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-run-'));
  const executor = new DuckDbSqlRunExecutor(
    new DuckDbApiAdapterFactory(),
    new DuckDbQueryBuilder(new DuckDbClauseRenderer())
  );
  const rows: Record<string, unknown>[] = [];
  try {
    for await (const batch of executor.execute(
      { databasePath: path.join(dir, 'st-run-values.duckdb') },
      {} as never,
      {} as never,
      sql
    )) {
      rows.push(...batch.rows);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return rows;
}

it('returns DECIMAL values as numbers and composite values as text', async () => {
  const rows = await runThroughExecutor(
    "SELECT ROUND(1.2345, 2) AS r, CAST(3.10 AS DECIMAL(10,2)) AS d, [1, 2] AS l, {'a': 1} AS s, MAP {'k': 1} AS m"
  );
  expect(rows).toEqual([{ r: 1.23, d: 3.1, l: '[1, 2]', s: "{'a': 1}", m: '{k=1}' }]);
});

it('returns TIMESTAMPTZ values as UTC ISO strings, whatever the host zone', async () => {
  const rows = await runThroughExecutor(
    "SELECT TIMESTAMPTZ '2024-03-01 23:30:00.123+00' AS ts, 'infinity'::TIMESTAMPTZ AS inf"
  );
  expect(rows).toEqual([{ ts: '2024-03-01T23:30:00.123Z', inf: 'infinity' }]);
});

// Filters cast these columns to VARCHAR, so a filter matches only if users see that same text.
it('returns LIST, STRUCT and MAP values as the text CAST(... AS VARCHAR) gives', async () => {
  const source =
    `(VALUES ` +
    `(1, ['x y', 'it''s', 'q"d', '', NULL, 'NULL', 'a,b'], ` +
    `{'n': 1.0::DOUBLE, 'b': 'x y', 'c': NULL, 'l': [1, NULL], 'q': 'it''s'}, ` +
    `[{'k': 'v, w', 'm': NULL}, NULL], MAP {'k 1': 'v=1', 'k2': NULL}), ` +
    `(2, [], {'n': 0.1::DOUBLE, 'b': '', 'c': 'c', 'l': [], 'q': ' lead'}, ` +
    `[], MAP {'k': '[x]'})` +
    `) AS v(id, list_col, struct_col, structs_col, map_col)`;
  const rows = await runThroughExecutor(`SELECT * FROM ${source} ORDER BY id DESC`);

  const instance = await createProductionDuckDbInstance();
  const connection = await instance.connect();
  try {
    const cast = await readSerializedRows(
      connection,
      `SELECT id, CAST(list_col AS VARCHAR) AS list_col, CAST(struct_col AS VARCHAR) AS struct_col, ` +
        `CAST(structs_col AS VARCHAR) AS structs_col, CAST(map_col AS VARCHAR) AS map_col ` +
        `FROM ${source} ORDER BY id DESC`
    );
    expect(cast[1].struct_col).toBe(
      "{'n': 1.0, 'b': x y, 'c': NULL, 'l': [1, NULL], 'q': 'it\\'s'}"
    );
    expect(rows).toEqual(cast);
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
});

it('prints a TIMESTAMPTZ inside a composite value in UTC, whatever the host zone', async () => {
  expect(
    await runThroughExecutor("SELECT {'t': TIMESTAMPTZ '2024-03-01 02:00:00+02'} AS s")
  ).toEqual([{ s: "{'t': '2024-03-01 00:00:00+00'}" }]);
});

it('still runs SQL whose composite columns it cannot wrap', async () => {
  // The comment would swallow the wrapper's closing parenthesis, so the SQL runs unwrapped.
  expect(await runThroughExecutor('SELECT [1, 2] AS l; -- note')).toEqual([{ l: '[1, 2]' }]);
});

describe('DuckDbSqlRunExecutor batches', () => {
  let dir: string;
  let dbPath: string;
  const executor = new DuckDbSqlRunExecutor(
    new DuckDbApiAdapterFactory(),
    new DuckDbQueryBuilder(new DuckDbClauseRenderer())
  );

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-run-'));
    dbPath = path.join(dir, 'st-run-batches.duckdb');
    // More rows than one DuckDB chunk (2048), so batches span chunks.
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE TABLE main.t AS SELECT range AS id FROM range(2500)');
    conn.closeSync();
    inst.closeSync();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('emits maxRowsPerBatch rows per batch until the remainder', async () => {
    const sizes: number[] = [];
    for await (const batch of executor.execute(
      { databasePath: dbPath },
      {} as never,
      {} as never,
      'SELECT id FROM main.t',
      { maxRowsPerBatch: 1000 }
    )) {
      sizes.push(batch.rows.length);
    }
    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it('releases the file when the consumer stops after the first batch', async () => {
    for await (const batch of executor.execute(
      { databasePath: dbPath },
      {} as never,
      {} as never,
      'SELECT id FROM main.t',
      { maxRowsPerBatch: 1000 }
    )) {
      expect(batch.rows).toHaveLength(1000);
      break;
    }

    const writer = new DuckDbApiAdapter(dbPath, 'READ_WRITE', { attempts: 1 });
    try {
      await expect(writer.runStatement('CREATE VIEW main.v AS SELECT 1 AS x')).resolves.toBe(
        undefined
      );
    } finally {
      await writer.close();
    }
  });
});
