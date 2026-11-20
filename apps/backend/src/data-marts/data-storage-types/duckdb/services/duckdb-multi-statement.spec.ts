import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DuckDbApiAdapter } from '../adapters/duckdb-api.adapter';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { DuckDbCreateViewExecutor } from './duckdb-create-view.executor';
import { DuckDbSqlDryRunExecutor } from './duckdb-sql-dry-run.executor';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

const SECOND_STATEMENT = 'SELECT 1; DROP TABLE main.victim';

describe('DuckDB refuses SQL that holds more than one statement', () => {
  const storageId = 'st-multi';
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-multi-'));
    dbPath = path.join(dir, `${storageId}.duckdb`);
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE TABLE main.victim AS SELECT range AS id FROM range(3)');
    conn.closeSync();
    inst.closeSync();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  async function victimRows(): Promise<number> {
    const adapter = new DuckDbApiAdapter(dbPath);
    try {
      const stream = await adapter.streamQuery('SELECT count(*) AS n FROM main.victim');
      const rows = await stream.fetchRows();
      return Number(rows?.[0].n);
    } finally {
      await adapter.close();
    }
  }

  async function withAdapter<T>(run: (adapter: DuckDbApiAdapter) => Promise<T>): Promise<T> {
    const adapter = new DuckDbApiAdapter(dbPath);
    try {
      return await run(adapter);
    } finally {
      await adapter.close();
    }
  }

  it('refuses a second statement in the SQL of a view, and the table keeps its rows', async () => {
    const executor = new DuckDbCreateViewExecutor(new DuckDbApiAdapterFactory());

    const error = await executor
      .createView({ databasePath: dbPath }, {} as never, 'main.v', SECOND_STATEMENT)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BusinessViolationException);
    expect((error as Error).message).toBe('Only one SQL statement is allowed');
    expect(await victimRows()).toBe(3);
  });

  it('still creates a view from one statement with a trailing semicolon', async () => {
    const executor = new DuckDbCreateViewExecutor(new DuckDbApiAdapterFactory());

    await executor.createView(
      { databasePath: dbPath },
      {} as never,
      'main.v',
      'SELECT id FROM main.victim;'
    );

    const rows = await withAdapter(async adapter => {
      const stream = await adapter.streamQuery('SELECT count(*) AS n FROM main.v;');
      return stream.fetchRows();
    });
    expect(Number(rows?.[0].n)).toBe(3);
  });

  it('reports a second statement in a dry run as invalid SQL, so it can be repaired', async () => {
    const executor = new DuckDbSqlDryRunExecutor(new DuckDbApiAdapterFactory());

    const result = await executor.execute({ databasePath: dbPath }, {} as never, SECOND_STATEMENT);

    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Only one SQL statement is allowed');
    expect(await victimRows()).toBe(3);
  });

  it('refuses a second statement when describing a query', async () => {
    await expect(withAdapter(adapter => adapter.describeQuery(SECOND_STATEMENT))).rejects.toThrow(
      'Only one SQL statement is allowed'
    );
  });

  it('refuses a second statement when streaming a query', async () => {
    await expect(withAdapter(adapter => adapter.streamQuery(SECOND_STATEMENT))).rejects.toThrow(
      'Only one SQL statement is allowed'
    );
  });
});
