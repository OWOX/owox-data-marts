import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';

// DuckDB surfaces a cross-process write-lock conflict with messages like
// "Could not set lock on file ...: Conflicting lock is held ... by PID ...".
// \block\b requires "lock" as a whole word so unrelated errors that merely contain
// the substring (e.g. "blocked", "clock", "unlocking") are not mistaken for a lock
// conflict, retried, and then masked behind the generic busy-storage error below.
const LOCK_CONFLICT = /\block\b|being used by another/i;

/** The in-process coordinator turned an open away: another operation of this process holds the file. */
export class DuckDbFileBusyError extends Error {}

/** The storage stayed locked for the whole retry budget. */
export class DuckDbStorageBusyException extends BusinessViolationException {}

export interface DuckDbLockRetryOptions {
  attempts?: number; // default 13
  baseDelayMs?: number; // default 100, doubling
  maxDelayMs?: number; // default 4000 → about 30 s of waiting in total
  sleepFn?: (ms: number) => Promise<void>; // injectable for tests
}

const defaultSleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Runs `fn`, retrying with exponential backoff when the failure looks like a
 * DuckDB cross-process lock conflict (DuckDB is single-writer-per-file; the
 * connector-runner child process may briefly hold the file open READ_WRITE during a
 * load, and DuckDB conflicts on ANY other-process open — including READ_ONLY —
 * while that write lock is held). Any other error propagates immediately without
 * retry. After exhausting all attempts on a lock conflict, throws a clear
 * {@link DuckDbStorageBusyException} instead of the raw DuckDB error text.
 *
 * Named for the conflict it retries (a lock conflict), not for which side opens the
 * file — `DuckDbApiAdapter.conn()` wraps EVERY open (both READ_ONLY and READ_WRITE)
 * in this, so read paths ride out a concurrent load too, not just writers.
 */
export async function withDuckDbLockRetry<T>(
  fn: () => Promise<T>,
  options: DuckDbLockRetryOptions = {}
): Promise<T> {
  const attempts = options.attempts ?? 13;
  const baseDelayMs = options.baseDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const sleep = options.sleepFn ?? defaultSleep;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!(error instanceof DuckDbFileBusyError) && !LOCK_CONFLICT.test(message)) throw error;
      if (attempt < attempts - 1) await sleep(Math.min(baseDelayMs * 2 ** attempt, maxDelayMs));
    }
  }
  throw new DuckDbStorageBusyException(
    'DuckDB storage is busy (a load or query is in progress); retry shortly.'
  );
}
