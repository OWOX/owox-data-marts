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
