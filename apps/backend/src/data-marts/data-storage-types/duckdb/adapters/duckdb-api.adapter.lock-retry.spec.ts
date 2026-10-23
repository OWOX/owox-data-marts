import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { DuckDbApiAdapter } from './duckdb-api.adapter';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { createProductionDuckDbInstance } from '../__fixtures__/production-duckdb-instance';

/**
 * Spawns a REAL, separate OS process that opens `dbPath` READ_WRITE and holds it open
 * (having created a table) until `release()` is called. This is the only way to reproduce a
 * genuine DuckDB lock conflict in a test: DuckDB's file lock is scoped per-OS-process, so two
 * opens from the SAME process never conflict (verified empirically while building this test —
 * a second `DuckDBInstance.create` on the same path, from the same process as the first,
 * always succeeds). Only a second process opening the same file while the first still holds
 * it conflicts, exactly like the real connector-runner child process vs. the backend.
 *
 * The child's stdin-`end` handler deliberately keeps a live reference to `inst`/`conn` (to
 * close them). Omitting that reference lets V8 garbage-collect the wrapper objects as soon as
 * nothing else in the child references them, which finalizes the native handles and releases
 * the OS lock *before* the parent's assertion runs — this was the difference between a test
 * that reliably reproduces the conflict and one that silently doesn't.
 */
async function spawnDuckDbLockHolder(
  dbPath: string
): Promise<{ child: ChildProcessWithoutNullStreams; release: () => Promise<void> }> {
  const duckModulePath = require.resolve('@duckdb/node-api');
  // Absolute-path require (not the bare specifier) so the child resolves the module
  // regardless of its own cwd.
  const childSource = `
    const duck = require(${JSON.stringify(duckModulePath)});
    (async () => {
      const inst = await duck.DuckDBInstance.create(process.env.DUCKDB_LOCK_TEST_DB_PATH, { access_mode: 'READ_WRITE' });
      const conn = await inst.connect();
      await conn.run('CREATE TABLE main.t(id BIGINT)');
      process.stdout.write('READY\\n');
      process.stdin.resume();
      process.stdin.on('end', () => {
        conn.closeSync?.();
        inst.closeSync?.();
        process.exit(0);
      });
    })().catch(err => {
      console.error('LOCK_TEST_CHILD_ERROR', err && err.message);
      process.exit(1);
    });
  `;
  const child = spawn(process.execPath, ['-e', childSource], {
    env: { ...process.env, DUCKDB_LOCK_TEST_DB_PATH: dbPath },
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  await new Promise<void>((resolve, reject) => {
    let buf = '';
    const timeout = setTimeout(
      () => reject(new Error('timeout waiting for lock-holder child READY')),
      10000
    );
    child.stdout.on('data', d => {
      buf += d.toString();
      if (buf.includes('READY')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`lock-holder child exited early with code ${code}`));
    });
  });

  return {
    child,
    release: () =>
      new Promise<void>(resolve => {
        child.on('exit', () => resolve());
        child.stdin.end();
      }),
  };
}

/** Opens `dbPath` READ_WRITE in another process, holds it for `holdMs`, then closes and exits. */
async function holdWriteLockBriefly(
  dbPath: string,
  holdMs: number
): Promise<{ exited: Promise<void> }> {
  const childSource = `
    require(${JSON.stringify(require.resolve('@duckdb/node-api'))})
      .DuckDBInstance.create(process.env.DUCKDB_LOCK_TEST_DB_PATH, { access_mode: 'READ_WRITE' })
      .then(instance => {
        process.stdout.write('READY\\n');
        setTimeout(() => instance.closeSync(), ${holdMs});
      });
  `;
  const child = spawn(process.execPath, ['-e', childSource], {
    env: { ...process.env, DUCKDB_LOCK_TEST_DB_PATH: dbPath },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const exited = new Promise<void>(resolve => child.on('exit', () => resolve()));
  await new Promise<void>((resolve, reject) => {
    child.stdout.on('data', d => String(d).includes('READY') && resolve());
    void exited.then(() => reject(new Error('lock holder exited before READY')));
  });
  // Wrapped: an async function returning the promise itself would wait for the exit.
  return { exited };
}

describe('DuckDbApiAdapter conn() lock-conflict retry (REAL cross-process lock)', () => {
  it('a READ_ONLY read waits for another process to release its write lock, then reads', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'duckadp-lockwait-'));
    const dbPath = path.join(dir, 'st.duckdb');
    const seed = await createProductionDuckDbInstance(dbPath);
    const connection = await seed.connect();
    await connection.run('CREATE TABLE main.t AS SELECT 42 AS id');
    connection.closeSync();
    seed.closeSync();

    const { exited } = await holdWriteLockBriefly(dbPath, 500);
    const delaysMs: number[] = [];
    const reader = new DuckDbApiAdapter(dbPath, 'READ_ONLY', {
      baseDelayMs: 50,
      sleepFn: ms => {
        delaysMs.push(ms);
        return new Promise(resolve => setTimeout(resolve, ms));
      },
    });
    try {
      const stream = await reader.streamQuery('SELECT id FROM main.t');
      expect(await stream.fetchRows()).toEqual([{ id: 42 }]);
      expect(delaysMs.length).toBeGreaterThan(0);
    } finally {
      await reader.close();
      await exited;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it('a READ_ONLY open of a file held READ_WRITE by another OS process retries then throws the clear busy error', async () => {
    const dbPath = path.join(os.tmpdir(), `duckadp-lock-${process.pid}-${Date.now()}.duckdb`);
    const { release } = await spawnDuckDbLockHolder(dbPath);
    try {
      // Fast-backoff seam (constructor 3rd param): a no-op sleepFn plus a low attempt count
      // keeps this test's retry cycle near-instant instead of riding the production defaults
      // (5 attempts / exponential 100ms base, ~1.5s of real sleep). Recording each requested
      // delay also proves the retry loop actually ran more than once, not just a single
      // immediate throw.
      const recordedDelaysMs: number[] = [];
      const reader = new DuckDbApiAdapter(dbPath, 'READ_ONLY', {
        attempts: 3,
        baseDelayMs: 0,
        sleepFn: async ms => {
          recordedDelaysMs.push(ms);
        },
      });

      let caught: unknown;
      try {
        await reader.introspectColumns('main', 't');
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BusinessViolationException);
      expect((caught as Error).message).toMatch(/storage is busy/i);
      // attempts: 3 → 2 sleeps between attempts, none after the last (exhausted) attempt.
      expect(recordedDelaysMs).toEqual([0, 0]);
    } finally {
      await release();
      fs.rmSync(dbPath, { force: true });
    }
  }, 20000);
});
