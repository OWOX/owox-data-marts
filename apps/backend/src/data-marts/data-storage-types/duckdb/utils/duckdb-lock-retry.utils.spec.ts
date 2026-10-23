import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import {
  DuckDbFileBusyError,
  DuckDbStorageBusyException,
  withDuckDbLockRetry,
} from './duckdb-lock-retry.utils';

const noSleep = async () => {};

describe('withDuckDbLockRetry', () => {
  it('retries lock-conflict errors then succeeds', async () => {
    let calls = 0;
    const out = await withDuckDbLockRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('Could not set lock on file: Conflicting lock is held');
        return 'ok';
      },
      { sleepFn: noSleep }
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  it('retries a refusal by the in-process coordinator, whatever its message says', async () => {
    let calls = 0;
    const out = await withDuckDbLockRetry(
      async () => {
        if (++calls < 3) throw new DuckDbFileBusyError('file in use by another operation');
        return 'ok';
      },
      { sleepFn: noSleep }
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does NOT retry a non-lock error (propagates immediately)', async () => {
    let calls = 0;
    await expect(
      withDuckDbLockRetry(
        async () => {
          calls++;
          throw new Error('Parser Error: syntax');
        },
        { sleepFn: noSleep }
      )
    ).rejects.toThrow('Parser Error: syntax');
    expect(calls).toBe(1);
  });

  it('does NOT retry an unrelated error whose message merely contains "blocked" (not the word "lock")', async () => {
    let calls = 0;
    await expect(
      withDuckDbLockRetry(
        async () => {
          calls++;
          throw new Error('request was blocked by policy');
        },
        { sleepFn: noSleep }
      )
    ).rejects.toThrow('request was blocked by policy');
    expect(calls).toBe(1);
  });

  it('throws a clear busy error after exhausting attempts', async () => {
    let calls = 0;
    const retrying = withDuckDbLockRetry(
      async () => {
        calls++;
        throw new Error('Conflicting lock is held');
      },
      { attempts: 2, sleepFn: noSleep }
    );
    await expect(retrying).rejects.toThrow(/storage is busy/i);
    await expect(retrying).rejects.toBeInstanceOf(DuckDbStorageBusyException);
    expect(calls).toBe(2);
  });

  it('default schedule waits about 30 s before giving up', async () => {
    const delays: number[] = [];
    await expect(
      withDuckDbLockRetry(
        async () => {
          throw new Error('Could not set lock on file x');
        },
        {
          sleepFn: async ms => {
            delays.push(ms);
          },
        }
      )
    ).rejects.toThrow(BusinessViolationException);
    expect(delays).toEqual([100, 200, 400, 800, 1600, 3200, 4000, 4000, 4000, 4000, 4000, 4000]);
  });
});
