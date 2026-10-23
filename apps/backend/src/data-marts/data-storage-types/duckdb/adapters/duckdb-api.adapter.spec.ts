import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { DuckDbApiAdapterFactory } from './duckdb-api-adapter.factory';
import { createHardenedInstance, DuckDbApiAdapter } from './duckdb-api.adapter';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

describe.each(['READ_ONLY', 'READ_WRITE'] as const)('DuckDbApiAdapter (%s) host access', mode => {
  let dir: string;
  let dbPath: string;
  let adapter: DuckDbApiAdapter;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckadp-host-'));
    dbPath = path.join(dir, 'st.duckdb');
    fs.writeFileSync(path.join(dir, 'host-file.txt'), 'host secret');
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE TABLE main."orders" AS SELECT 1 AS id');
    conn.closeSync();
    inst.closeSync();
    adapter = new DuckDbApiAdapter(dbPath, mode);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await adapter.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function readAll(sql: string): Promise<Record<string, unknown>[]> {
    const stream = await adapter.streamQuery(sql);
    const rows: Record<string, unknown>[] = [];
    for (let r = await stream.fetchRows(); r !== null; r = await stream.fetchRows())
      rows.push(...r);
    return rows;
  }

  it('still reads tables of the storage file', async () => {
    expect(await readAll('SELECT id FROM main."orders"')).toEqual([{ id: 1 }]);
  });

  it('refuses to read a file of the host', async () => {
    const hostFile = path.join(dir, 'host-file.txt').replace(/'/g, "''");
    await expect(readAll(`SELECT * FROM read_text('${hostFile}')`)).rejects.toThrow(
      /file system operations are disabled/i
    );
  });

  it('refuses to attach another database file', async () => {
    const other = path.join(dir, 'other.duckdb');
    await expect(adapter.runStatement(`ATTACH '${other}'`)).rejects.toThrow(
      /file system operations are disabled/i
    );
    expect(fs.existsSync(other)).toBe(false);
  });

  it('refuses to copy a result to a file of the host', async () => {
    const target = path.join(dir, 'x.csv');
    await expect(adapter.runStatement(`COPY (SELECT 1) TO '${target}'`)).rejects.toThrow(
      /file system operations are disabled/i
    );
    expect(fs.existsSync(target)).toBe(false);
  });

  it('runs in UTC whatever the host zone, and keeps it', async () => {
    expect(await readAll("SELECT current_setting('TimeZone') AS zone")).toEqual([{ zone: 'UTC' }]);
    await expect(adapter.runStatement("SET TimeZone = 'Europe/Kyiv'")).rejects.toThrow(
      /configuration has been locked/i
    );
    await expect(adapter.runStatement('SET lock_configuration = false')).rejects.toThrow(
      /configuration has been locked/i
    );
  });

  it('refuses to turn external access back on', async () => {
    await expect(adapter.runStatement('SET enable_external_access = true')).rejects.toThrow(
      /configuration has been locked/i
    );
  });

  it('runs within a quarter of the memory, half of the cores and 10 GB of temp space', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const duck = require('@duckdb/node-api');
    const settings =
      "SELECT current_setting('memory_limit') AS memory, current_setting('threads') AS threads, " +
      "current_setting('max_temp_directory_size') AS temp";
    const memory = Math.min(os.totalmem(), process.constrainedMemory() || Infinity);
    const reference = await duck.DuckDBInstance.create(':memory:', {
      memory_limit: `${Math.max(256, Math.floor(memory / 4 / 1e6))}MB`,
      threads: String(Math.max(1, Math.floor(os.availableParallelism() / 2))),
      max_temp_directory_size: '10GB',
    });
    try {
      const expected = (await (await reference.connect()).runAndReadAll(settings)).getRowObjects();

      expect(await readAll(settings)).toEqual(expected);
    } finally {
      reference.closeSync();
    }
  });

  it('takes the quarter from the container memory limit when it is lower', async () => {
    jest.spyOn(process, 'constrainedMemory').mockReturnValue(2e9);

    expect(await readAll("SELECT current_setting('memory_limit') AS memory")).toEqual([
      { memory: '476.8 MiB' },
    ]);
  });

  it('refuses to raise the memory limit', async () => {
    await expect(adapter.runStatement("SET memory_limit = '1TB'")).rejects.toThrow(
      /configuration has been locked/i
    );
  });
});

describe('createHardenedInstance', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const duck = require('@duckdb/node-api');
  const setError = new Error('SET failed');

  function failingInstance(closeSync: () => void, closeConnection: () => void = () => undefined) {
    const connection = {
      run: jest.fn().mockRejectedValue(setError),
      closeSync: jest.fn(closeConnection),
    };
    const instance = {
      connect: jest.fn().mockResolvedValue(connection),
      closeSync: jest.fn(closeSync),
    };
    jest.spyOn(duck.DuckDBInstance, 'create').mockResolvedValueOnce(instance);
    return { instance, connection };
  }

  afterEach(() => jest.restoreAllMocks());

  it('closes the instance and rethrows when a setup SET fails', async () => {
    const { instance, connection } = failingInstance(() => undefined);

    await expect(createHardenedInstance(':memory:')).rejects.toBe(setError);
    expect(connection.closeSync).toHaveBeenCalledTimes(1);
    expect(instance.closeSync).toHaveBeenCalledTimes(1);
  });

  it('rethrows the SET error when closing the instance fails too', async () => {
    const { instance } = failingInstance(() => {
      throw new Error('close failed');
    });

    await expect(createHardenedInstance(':memory:')).rejects.toBe(setError);
    expect(instance.closeSync).toHaveBeenCalledTimes(1);
  });

  it('rethrows the SET error when closing the connection fails too', async () => {
    const { instance, connection } = failingInstance(
      () => undefined,
      () => {
        throw new Error('connection close failed');
      }
    );

    await expect(createHardenedInstance(':memory:')).rejects.toBe(setError);
    expect(connection.closeSync).toHaveBeenCalledTimes(1);
    expect(instance.closeSync).toHaveBeenCalledTimes(1);
  });
});

describe('DuckDbApiAdapter.introspectColumns', () => {
  it('reads column names/types from an existing .duckdb (READ_ONLY)', async () => {
    const dbPath = path.join(os.tmpdir(), `duckadp-${process.pid}-${Date.now()}.duckdb`);
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE SCHEMA IF NOT EXISTS main');
    await conn.run('CREATE TABLE main."orders" (id BIGINT, name VARCHAR)');
    const factory = new DuckDbApiAdapterFactory();
    const adapter = factory.createForDatabasePath(dbPath);
    try {
      const cols = await adapter.introspectColumns('main', 'orders');
      const byName = Object.fromEntries(cols.map(c => [c.name, c.type.toUpperCase()]));
      expect(byName.id).toContain('BIGINT');
      expect(byName.name).toContain('VARCHAR');
    } finally {
      await adapter.close();
      fs.rmSync(dbPath, { force: true });
    }
  });
});
