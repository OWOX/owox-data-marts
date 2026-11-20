import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DuckDbDataMartSchemaProvider } from './duckdb-data-mart-schema.provider';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckdbFieldType } from '../enums/duckdb-field-type.enum';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

it('introspects a temp .duckdb into a duckdb-data-mart-schema', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-sp-'));
  const storageId = 'st-schema-1';
  const dbPath = path.join(dir, `${storageId}.duckdb`);
  const inst = await createProductionDuckDbInstance(dbPath);
  const conn = await inst.connect();
  await conn.run('CREATE SCHEMA IF NOT EXISTS main');
  await conn.run('CREATE TABLE main."orders"(id BIGINT, name VARCHAR)');
  conn.closeSync?.();
  inst.closeSync?.();
  const provider = new DuckDbDataMartSchemaProvider(new DuckDbApiAdapterFactory());
  const def = {
    definitionType: 'CONNECTOR',
    connector: {
      storage: { fullyQualifiedName: 'main.orders' },
      source: { name: 'src', configuration: [{}], node: 'n', fields: ['f'] },
    },
  } as never;
  const schema = await provider.getActualDataMartSchema(def, {} as never, { databasePath: dbPath });
  expect(schema.type).toBe('duckdb-data-mart-schema');
  const byName = Object.fromEntries(schema.fields.map(f => [f.name, f.type]));
  expect(byName.id).toBe(DuckdbFieldType.BIGINT);
  expect(byName.name).toBe(DuckdbFieldType.VARCHAR);
  fs.rmSync(dir, { recursive: true, force: true });
});

it('derives a SQL data mart schema from the query result columns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-sp-'));
  const storageId = 'st-schema-sql';
  const dbPath = path.join(dir, `${storageId}.duckdb`);
  const inst = await createProductionDuckDbInstance(dbPath);
  const conn = await inst.connect();
  await conn.run('CREATE TABLE main."holidays"(id VARCHAR, date DATE, name VARCHAR)');
  conn.closeSync?.();
  inst.closeSync?.();
  const provider = new DuckDbDataMartSchemaProvider(new DuckDbApiAdapterFactory());
  const def = {
    sqlQuery:
      'SELECT id, CAST(date AS TIMESTAMP) AS event_ts, CAST(date AS TIMESTAMPTZ) AS event_tz, name, [1, 2] AS tags FROM main.holidays;',
  } as never;
  const schema = await provider.getActualDataMartSchema(def, {} as never, { databasePath: dbPath });
  expect(schema.fields.map(f => [f.name, f.type])).toEqual([
    ['id', DuckdbFieldType.VARCHAR],
    ['event_ts', DuckdbFieldType.TIMESTAMP],
    ['event_tz', DuckdbFieldType.TIMESTAMPTZ],
    ['name', DuckdbFieldType.VARCHAR],
    ['tags', DuckdbFieldType.VARCHAR],
  ]);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('a table reference', () => {
  let dir: string;
  let dbPath: string;
  const provider = new DuckDbDataMartSchemaProvider(new DuckDbApiAdapterFactory());

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-sp-'));
    dbPath = path.join(dir, 'st.duckdb');
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE TABLE main.holidays(id BIGINT)');
    conn.closeSync();
    inst.closeSync();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('finds the table when the reference uses other letter case, as DuckDB does', async () => {
    const schema = await provider.getActualDataMartSchema(
      { fullyQualifiedName: '"MAIN"."HOLIDAYS"' } as never,
      {} as never,
      { databasePath: dbPath }
    );
    expect(schema.fields.map(f => [f.name, f.type])).toEqual([['id', DuckdbFieldType.BIGINT]]);
  });

  it('fails when the table of a Table Data Mart is not in the file', async () => {
    await expect(
      provider.getActualDataMartSchema(
        { fullyQualifiedName: 'main.missing' } as never,
        {} as never,
        {
          databasePath: dbPath,
        }
      )
    ).rejects.toThrow('Table main.missing is not found');
  });

  it('takes the connector source fields before the first load creates the table', async () => {
    const schema = await provider.getActualDataMartSchema(
      {
        connector: {
          storage: { fullyQualifiedName: 'main.missing' },
          source: { name: 'src', configuration: [{}], node: 'n', fields: ['date', 'name'] },
        },
      } as never,
      {} as never,
      { databasePath: dbPath }
    );
    expect(schema.fields.map(f => [f.name, f.type])).toEqual([
      ['date', DuckdbFieldType.VARCHAR],
      ['name', DuckdbFieldType.VARCHAR],
    ]);
  });
});
