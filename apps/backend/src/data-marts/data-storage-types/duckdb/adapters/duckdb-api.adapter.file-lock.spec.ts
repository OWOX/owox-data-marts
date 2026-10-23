import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as v8 from 'node:v8';
import * as vm from 'node:vm';
import { DuckDbApiAdapter } from './duckdb-api.adapter';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const duck = require('@duckdb/node-api');

function openReadWriteFromAnotherProcess(dbPath: string): string {
  const source = `
    require(${JSON.stringify(require.resolve('@duckdb/node-api'))})
      .DuckDBInstance.create(process.env.DUCKDB_TEST_DB_PATH, { access_mode: 'READ_WRITE' })
      .then(i => { i.closeSync(); console.log('OPENED'); }, e => console.log(e.message));
  `;
  const { stdout } = spawnSync(process.execPath, ['-e', source], {
    env: { ...process.env, DUCKDB_TEST_DB_PATH: dbPath },
    encoding: 'utf8',
  });
  return stdout.trim();
}

const tick = () => new Promise(resolve => setImmediate(resolve));

async function readOnceAndDrop(dbPath: string): Promise<void> {
  await new DuckDbApiAdapter(dbPath).introspectColumns('main', 't');
}

async function streamOnceAndDrop(dbPath: string): Promise<void> {
  const stream = await new DuckDbApiAdapter(dbPath).streamQuery('SELECT id FROM main.t');
  await stream.fetchRows();
}

describe('DuckDbApiAdapter file lock within one process', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckadp-filelock-'));
    dbPath = path.join(dir, 'st.duckdb');
    const inst = await createProductionDuckDbInstance(dbPath);
    const conn = await inst.connect();
    await conn.run('CREATE TABLE main.t AS SELECT range AS id FROM range(10000)');
    conn.closeSync();
    inst.closeSync();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps the file locked against other processes until the last reader closes', async () => {
    const first = new DuckDbApiAdapter(dbPath);
    const second = new DuckDbApiAdapter(dbPath);
    await first.introspectColumns('main', 't');
    await second.introspectColumns('main', 't');

    await first.close();
    expect(openReadWriteFromAnotherProcess(dbPath)).toMatch(/conflicting lock/i);

    await second.close();
    expect(openReadWriteFromAnotherProcess(dbPath)).toBe('OPENED');
  }, 20000);

  it('lets concurrent readers share one pending open and frees the file after both close', async () => {
    const create = jest.spyOn(duck.DuckDBInstance, 'create');
    const first = new DuckDbApiAdapter(dbPath);
    const second = new DuckDbApiAdapter(dbPath);

    const columns = await Promise.all([
      first.introspectColumns('main', 't'),
      second.introspectColumns('main', 't'),
    ]);

    expect(columns).toEqual([[{ name: 'id', type: 'BIGINT' }], [{ name: 'id', type: 'BIGINT' }]]);
    expect(create).toHaveBeenCalledTimes(1);
    await first.close();
    await second.close();
    expect(openReadWriteFromAnotherProcess(dbPath)).toBe('OPENED');
  }, 20000);

  it('releases the file when a reader closes with its stream not read to the end', async () => {
    const reader = new DuckDbApiAdapter(dbPath);
    const stream = await reader.streamQuery('SELECT id FROM main.t');
    expect(await stream.fetchRows()).not.toBeNull();

    await reader.close();
    expect(openReadWriteFromAnotherProcess(dbPath)).toBe('OPENED');
  }, 20000);

  it('makes a writer wait for in-process readers, and readers wait for the writer', async () => {
    const reader = new DuckDbApiAdapter(dbPath);
    await reader.introspectColumns('main', 't');

    let releaseWriter!: () => void;
    const readerClosed = new Promise<void>(resolve => (releaseWriter = resolve));
    const writerSleep = jest.fn(() => readerClosed);
    const writer = new DuckDbApiAdapter(dbPath, 'READ_WRITE', { sleepFn: writerSleep });
    const writing = writer.runStatement('CREATE VIEW main.v AS SELECT id FROM main.t');
    await tick();
    expect(writerSleep).toHaveBeenCalled();

    await reader.close();
    releaseWriter();
    await writing;

    let resumeReader!: () => void;
    const writerClosed = new Promise<void>(resolve => (resumeReader = resolve));
    const readerSleep = jest.fn(() => writerClosed);
    const lateReader = new DuckDbApiAdapter(dbPath, 'READ_ONLY', { sleepFn: readerSleep });
    const reading = lateReader.introspectColumns('main', 'v');
    await tick();
    expect(readerSleep).toHaveBeenCalled();

    await writer.close();
    resumeReader();
    expect(await reading).toEqual([{ name: 'id', type: 'BIGINT' }]);
    await lateReader.close();
  }, 20000);

  it('holds a reader that arrives while a writer waits until the writer finishes', async () => {
    const firstReader = new DuckDbApiAdapter(dbPath);
    await firstReader.introspectColumns('main', 't');

    let resumeWriter!: () => void;
    const writerSleep = jest.fn(() => new Promise<void>(resolve => (resumeWriter = resolve)));
    const writer = new DuckDbApiAdapter(dbPath, 'READ_WRITE', { sleepFn: writerSleep });
    const writing = writer.runStatement('CREATE VIEW main.v AS SELECT id FROM main.t');
    await tick();
    expect(writerSleep).toHaveBeenCalled();

    let resumeReader!: () => void;
    const readerSleep = jest.fn(() => new Promise<void>(resolve => (resumeReader = resolve)));
    const lateReader = new DuckDbApiAdapter(dbPath, 'READ_ONLY', { sleepFn: readerSleep });
    const reading = lateReader.introspectColumns('main', 'v');
    await tick();
    expect(readerSleep).toHaveBeenCalled();

    await firstReader.close();
    resumeWriter();
    await writing;
    await writer.close();
    resumeReader();
    expect(await reading).toEqual([{ name: 'id', type: 'BIGINT' }]);
    await lateReader.close();
  }, 20000);

  it('gives the file back when an adapter is dropped without close()', async () => {
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc') as () => void;
    await readOnceAndDrop(dbPath);
    gc();

    // The registry callback runs some time after collection: poll for it with short waits.
    const writer = new DuckDbApiAdapter(dbPath, 'READ_WRITE', {
      attempts: 20,
      sleepFn: async () => {
        gc();
        await new Promise(resolve => setTimeout(resolve, 10));
      },
    });
    try {
      await expect(writer.runStatement('CREATE VIEW main.v AS SELECT 1 AS x')).resolves.toBe(
        undefined
      );
    } finally {
      await writer.close();
    }
  });

  it('closes the connection and drains the stream of a dropped adapter before giving the file back', async () => {
    v8.setFlagsFromString('--expose-gc');
    const gc = vm.runInNewContext('gc') as () => void;
    const closeConnection = jest.spyOn(duck.DuckDBConnection.prototype, 'closeSync');
    await streamOnceAndDrop(dbPath);
    // Opening the instance closes its own setup connection; count only the adapter's.
    const closedByOpen = closeConnection.mock.calls.length;

    for (let i = 0; i < 50 && closeConnection.mock.calls.length === closedByOpen; i++) {
      gc();
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    expect(closeConnection.mock.calls.length - closedByOpen).toBe(1);
    const writer = new DuckDbApiAdapter(dbPath, 'READ_WRITE', {
      attempts: 20,
      sleepFn: () => new Promise(resolve => setTimeout(resolve, 10)),
    });
    try {
      await expect(writer.runStatement('CREATE VIEW main.v AS SELECT 1 AS x')).resolves.toBe(
        undefined
      );
    } finally {
      await writer.close();
    }
  });

  it('gives the file back without running anything when closed during an in-flight open', async () => {
    let finishCreate!: (instance: unknown) => void;
    const connection = { run: jest.fn(), runAndReadAll: jest.fn(), closeSync: jest.fn() };
    const instance = { connect: jest.fn().mockResolvedValue(connection), closeSync: jest.fn() };
    jest
      .spyOn(duck.DuckDBInstance, 'create')
      .mockReturnValue(new Promise(resolve => (finishCreate = resolve)));
    const adapter = new DuckDbApiAdapter(dbPath);

    const reading = adapter.introspectColumns('main', 't');
    await tick();
    const closing = adapter.close();
    finishCreate(instance);

    await expect(reading).rejects.toThrow(/closed/i);
    await closing;
    expect(connection.runAndReadAll).not.toHaveBeenCalled();
    expect(instance.closeSync).toHaveBeenCalledTimes(1);
  });

  it('creates a missing data directory on the first read-write open', async () => {
    const nestedPath = path.join(dir, 'missing', 'data', 'st.duckdb');
    const writer = new DuckDbApiAdapter(nestedPath, 'READ_WRITE', { attempts: 1 });
    try {
      await writer.runStatement('CREATE TABLE main.t AS SELECT 1 AS id');
    } finally {
      await writer.close();
    }

    expect(fs.existsSync(nestedPath)).toBe(true);
  });

  it('creates an empty database file when the first open is a read', async () => {
    const freshPath = path.join(dir, 'fresh', 'data', 'st.duckdb');
    const reader = new DuckDbApiAdapter(freshPath, 'READ_ONLY', { attempts: 1 });
    try {
      const stream = await reader.streamQuery('SELECT 1 AS one');
      expect(await stream.fetchRows()).toEqual([{ one: 1 }]);
    } finally {
      await reader.close();
    }

    expect(fs.existsSync(freshPath)).toBe(true);
  });

  it('gives the reader slot back when opening the instance throws at once', async () => {
    jest.spyOn(duck.DuckDBInstance, 'create').mockImplementationOnce(() => {
      throw new Error('bad options');
    });
    const reader = new DuckDbApiAdapter(dbPath, 'READ_ONLY', { attempts: 1 });
    await expect(reader.introspectColumns('main', 't')).rejects.toThrow('bad options');
    await reader.close();

    const writer = new DuckDbApiAdapter(dbPath, 'READ_WRITE', { attempts: 1 });
    try {
      await expect(writer.runStatement('CREATE VIEW main.v AS SELECT 1 AS x')).resolves.toBe(
        undefined
      );
    } finally {
      await writer.close();
    }
  });

  it('closes the instance when connecting to it fails, and caches nothing', async () => {
    const instance = {
      connect: jest.fn().mockRejectedValue(new Error('connect failed')),
      closeSync: jest.fn(),
    };
    const create = jest.spyOn(duck.DuckDBInstance, 'create').mockResolvedValue(instance);
    const adapter = new DuckDbApiAdapter(dbPath);

    await expect(adapter.introspectColumns('main', 't')).rejects.toThrow('connect failed');
    expect(instance.closeSync).toHaveBeenCalledTimes(1);

    await expect(adapter.introspectColumns('main', 't')).rejects.toThrow('connect failed');
    expect(create).toHaveBeenCalledTimes(2);
    await adapter.close();
  });
});
