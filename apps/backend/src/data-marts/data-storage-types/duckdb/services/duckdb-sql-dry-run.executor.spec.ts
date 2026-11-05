import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DuckDbSqlDryRunExecutor } from './duckdb-sql-dry-run.executor';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckDbStorageBusyException } from '../utils/duckdb-lock-retry.utils';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

async function createStorageFile(): Promise<{ dir: string; dbPath: string }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-dry-'));
  const dbPath = path.join(dir, 'st-dry.duckdb');
  const inst = await createProductionDuckDbInstance(dbPath);
  const conn = await inst.connect();
  await conn.run('CREATE TABLE main."t"(id BIGINT)');
  conn.closeSync();
  inst.closeSync();
  return { dir, dbPath };
}

it('validates good SQL (isValid true) and rejects bad SQL (isValid false)', async () => {
  const { dir, dbPath } = await createStorageFile();
  const executor = new DuckDbSqlDryRunExecutor(new DuckDbApiAdapterFactory());
  const credentials = { databasePath: dbPath };
  const ok = await executor.execute(credentials, {} as never, 'SELECT id FROM main."t"');
  expect(ok.isValid).toBe(true);
  const bad = await executor.execute(credentials, {} as never, 'SELECT nope FROM main."t"');
  expect(bad.isValid).toBe(false);
  expect(bad.error).toBeTruthy();
  fs.rmSync(dir, { recursive: true, force: true });
});

it('reports a busy storage as an error, not as invalid SQL', async () => {
  const busy = new DuckDbStorageBusyException(
    'DuckDB storage is busy (a load or query is in progress); retry shortly.'
  );
  const adapter = { runStatement: jest.fn().mockRejectedValue(busy), close: jest.fn() };
  const factory = { createForDatabasePath: () => adapter } as unknown as DuckDbApiAdapterFactory;
  const executor = new DuckDbSqlDryRunExecutor(factory);

  await expect(
    executor.execute(
      { databasePath: path.join(os.tmpdir(), 'st-busy.duckdb') },
      {} as never,
      'SELECT 1'
    )
  ).rejects.toBe(busy);
  expect(adapter.close).toHaveBeenCalledTimes(1);
});

it("reports a syntax error with DuckDB's own Parser Error text", async () => {
  const { dir, dbPath } = await createStorageFile();
  try {
    const result = await new DuckDbSqlDryRunExecutor(new DuckDbApiAdapterFactory()).execute(
      { databasePath: dbPath },
      {} as never,
      'SELEC id FROM main."t"'
    );

    expect(result.isValid).toBe(false);
    expect(result.error).toMatch(/^Parser Error: /);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
