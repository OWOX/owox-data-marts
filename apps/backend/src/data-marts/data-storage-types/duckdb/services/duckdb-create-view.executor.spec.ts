import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DuckDbCreateViewExecutor } from './duckdb-create-view.executor';
import { DuckDbApiAdapterFactory } from '../adapters/duckdb-api-adapter.factory';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

describe('DuckDbCreateViewExecutor', () => {
  it('creates a view, then a READ_ONLY query reads through it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duck-cv-'));
    const storageId = 'st-cv-1';
    const dbPath = path.join(dir, `${storageId}.duckdb`);
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE TABLE main."orders"(id BIGINT, amount BIGINT)');
    await conn.run('INSERT INTO main."orders" VALUES (1, 100), (2, 200)');
    conn.closeSync?.();
    inst.closeSync?.();

    const executor = new DuckDbCreateViewExecutor(new DuckDbApiAdapterFactory());
    const res = await executor.createView(
      { databasePath: dbPath },
      {} as never,
      'main.big_orders',
      'SELECT id, amount FROM main."orders" WHERE amount >= 200'
    );
    expect(res.fullyQualifiedName).toBe('main.big_orders');

    const ro = new DuckDbApiAdapterFactory().createForDatabasePath(dbPath);
    try {
      const stream = await ro.streamQuery('SELECT id FROM main."big_orders" ORDER BY id');
      const rows: Record<string, unknown>[] = [];
      for (let r = await stream.fetchRows(); r !== null; r = await stream.fetchRows())
        rows.push(...r);
      expect(rows.map(r => Number(r.id))).toEqual([2]);
      await stream.close();
    } finally {
      await ro.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws a clear error when the credentials carry no database path', async () => {
    const executor = new DuckDbCreateViewExecutor(new DuckDbApiAdapterFactory());
    await expect(
      executor.createView({} as never, {} as never, 'main.v', 'SELECT 1')
    ).rejects.toThrow(/database path/i);
  });
});
