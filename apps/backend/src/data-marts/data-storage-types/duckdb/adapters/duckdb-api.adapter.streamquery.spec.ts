import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DuckDbApiAdapterFactory } from './duckdb-api-adapter.factory';
import { DuckDbApiAdapter } from './duckdb-api.adapter';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const duck = require('@duckdb/node-api');

// Cannot finish in test time on any host: only an interrupt ends it.
const LONG_QUERY = 'SELECT sum(a.range * b.range) AS n FROM range(1000000) a, range(1000000) b';

describe('DuckDbApiAdapter.streamQuery limits', () => {
  const dbPath = path.join(os.tmpdir(), `duckq-limits-${process.pid}-${Date.now()}.duckdb`);

  afterAll(() => fs.rmSync(dbPath, { force: true }));

  async function readLongQuery(
    limits: { timeoutMs?: number; signal?: AbortSignal },
    sql = LONG_QUERY
  ) {
    const adapter = new DuckDbApiAdapterFactory().createForDatabasePath(dbPath);
    try {
      const stream = await adapter.streamQuery(sql, limits);
      while ((await stream.fetchRows()) !== null) continue;
    } finally {
      await adapter.close();
    }
  }

  it('interrupts a long query when its timeout passes', async () => {
    await expect(readLongQuery({ timeoutMs: 200 })).rejects.toThrow(/interrupt/i);
  }, 20000);

  it('interrupts a long query when its signal aborts', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);

    await expect(readLongQuery({ signal: controller.signal })).rejects.toThrow(/interrupt/i);
  }, 20000);

  it('does not lose an abort that comes while the query is being prepared', async () => {
    const controller = new AbortController();
    const original = duck.DuckDBConnection.prototype.prepare;
    const prepare = jest
      .spyOn(duck.DuckDBConnection.prototype, 'prepare')
      .mockImplementationOnce(function (this: unknown, sql: string) {
        controller.abort();
        return original.call(this, sql);
      });
    try {
      // Finishes in seconds when the abort is lost, so a lost abort fails instead of hanging.
      await expect(
        readLongQuery(
          { signal: controller.signal },
          'SELECT count(*) AS c FROM range(1500000000) r(i) WHERE i % 7 = 3'
        )
      ).rejects.toThrow(/interrupt/i);
    } finally {
      prepare.mockRestore();
    }
  }, 20000);

  it('does not start a query whose signal aborted while it waited for the file', async () => {
    const lockedPath = path.join(os.tmpdir(), `duckq-locked-${process.pid}-${Date.now()}.duckdb`);
    const startStream = jest.spyOn(duck.DuckDBConnection.prototype, 'prepare');
    const writer = new DuckDbApiAdapter(lockedPath, 'READ_WRITE');
    await writer.runStatement('CREATE TABLE main.t AS SELECT 1 AS id');
    const controller = new AbortController();
    const reader = new DuckDbApiAdapter(lockedPath, 'READ_ONLY', {
      sleepFn: async () => {
        controller.abort();
        await writer.close();
      },
    });
    try {
      await expect(
        reader.streamQuery('SELECT id FROM main.t', { signal: controller.signal })
      ).rejects.toThrow(/abort/i);
      expect(startStream).not.toHaveBeenCalled();
    } finally {
      startStream.mockRestore();
      await reader.close();
      await writer.close();
      fs.rmSync(lockedPath, { force: true });
    }
  });
});

describe('DuckDbApiAdapter.streamQuery', () => {
  it('streamQuery yields chunked row-objects then null (bigint primitive, temporal wrapper)', async () => {
    const dbPath = path.join(os.tmpdir(), `duckq-${process.pid}-${Date.now()}.duckdb`);
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE TABLE main."t"(id BIGINT, d DATE)');
    await conn.run(`INSERT INTO main."t" VALUES (1, DATE '2024-03-15'), (2, DATE '2024-03-16')`);
    conn.closeSync?.();
    inst.closeSync?.();
    const adapter = new DuckDbApiAdapterFactory().createForDatabasePath(dbPath);
    const stream = await adapter.streamQuery('SELECT id, d FROM main."t" ORDER BY id');
    try {
      const collected: Record<string, unknown>[] = [];
      for (let rows = await stream.fetchRows(); rows !== null; rows = await stream.fetchRows())
        collected.push(...rows);
      expect(collected.length).toBe(2); // all rows arrive across chunks, terminating on null
      expect(typeof collected[0].id).toBe('bigint'); // BIGINT → JS bigint primitive
      expect(String(collected[0].d)).toContain('2024-03-15'); // DATE → DuckDBDateValue, stringifies to the date
    } finally {
      await stream.close();
      await adapter.close();
      fs.rmSync(dbPath, { force: true });
    }
  });

  it('streams the statement it prepared, plain or with composite columns as text', async () => {
    const dbPath = path.join(os.tmpdir(), `duckq-prep-${process.pid}-${Date.now()}.duckdb`);
    const adapter = new DuckDbApiAdapterFactory().createForDatabasePath(dbPath);
    const prepare = jest.spyOn(duck.DuckDBConnection.prototype, 'prepare');
    const reprepare = jest.spyOn(duck.DuckDBConnection.prototype, 'stream');
    const readAll = async (sql: string) => {
      const stream = await adapter.streamQuery(sql);
      const rows: Record<string, unknown>[] = [];
      for (let r = await stream.fetchRows(); r !== null; r = await stream.fetchRows())
        rows.push(...r);
      return rows;
    };
    try {
      expect(await readAll('SELECT 1 AS id, 2 AS n')).toEqual([{ id: 1, n: 2 }]);
      expect(prepare).toHaveBeenCalledTimes(1);

      expect(await readAll("SELECT 1 AS id, [1, 2] AS l, {'a': 1} AS s")).toEqual([
        { id: 1, l: '[1, 2]', s: "{'a': 1}" },
      ]);
      expect(prepare).toHaveBeenCalledTimes(3);
      expect(reprepare).not.toHaveBeenCalled();
    } finally {
      prepare.mockRestore();
      reprepare.mockRestore();
      await adapter.close();
      fs.rmSync(dbPath, { force: true });
    }
  });
});
