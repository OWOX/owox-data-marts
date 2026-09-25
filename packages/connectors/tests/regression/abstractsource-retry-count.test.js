// packages/connectors/tests/regression/abstractsource-retry-count.test.js
//
// Regression test for G7c: AbstractSource.urlFetchWithRetry() (Core/AbstractSource.js
// ~204-213) looped `for (let attempt = 0; attempt <= maxRetries; attempt++)`,
// i.e. attempts 0,1,2,3 for `MaxFetchRetries: 3` — 4 total HTTP attempts.
//
// On main, `MaxFetchRetries` was the TOTAL attempt count, not the retry count
// on top of an initial try: `for (attempt = 1; attempt <= MaxFetchRetries;
// attempt++)` with `_shouldRetry` bailing once `attempt >= MaxFetchRetries`
// gives exactly 3 total attempts (2 retries) for `MaxFetchRetries: 3`.
//
// A persistently-failing retryable endpoint therefore made one extra HTTP
// call (and waited through one extra backoff) compared to main before giving
// up — silently changing failure timing/cost for every connector run.
//
// This test drives a persistently-failing retryable error through
// urlFetchWithRetry() with MaxFetchRetries: 3 and asserts EXACTLY 3 fetch
// calls (main parity), with an injectable `_delay` so the two backoff waits
// don't slow the test down.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AbstractSource } from '../../src/Core/AbstractSource.js';
import { AbstractContext } from '../../src/Core/AbstractContext.js';

function createContext(sourceConfig = {}) {
  return new AbstractContext({
    source: { name: 'TestSource', config: sourceConfig },
    storage: { name: 'TestStorage', config: {} },
    runConfig: {},
    env: { datamartId: 'dm-1', runId: 'run-1' },
  });
}

function suppressStdout() {
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk, ...rest) => {
    const str = typeof chunk === 'string' ? chunk : (chunk?.toString?.() ?? '');
    if (str.startsWith('{') && str.includes('"type"')) {
      return true;
    }
    return original(chunk, ...rest);
  };
  return () => {
    process.stdout.write = original;
  };
}

let originalFetch;
before(() => {
  originalFetch = globalThis.fetch;
});
after(() => {
  globalThis.fetch = originalFetch;
});

test('MaxFetchRetries=3 makes exactly 3 total HTTP attempts for a persistently-failing retryable error (main parity)', async () => {
  const restore = suppressStdout();
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return { ok: false, status: 500, statusText: 'Internal Server Error' };
  };
  try {
    const ctx = createContext({
      MaxFetchRetries: { value: 3 },
      InitialRetryDelay: { value: 1 },
    });
    class AlwaysRetrySource extends AbstractSource {
      isValidToRetry() {
        return true;
      }
    }
    const source = new AlwaysRetrySource(ctx);
    // Skip the real exponential backoff wait -- only the attempt count matters here.
    source._delay = () => Promise.resolve();

    await assert.rejects(() => source.urlFetchWithRetry('https://example.com/api'), /HTTP 500/);

    // Before the G7c fix, the loop ran attempts 0..maxRetries inclusive (4
    // total for MaxFetchRetries: 3). main's semantics -- and this assertion --
    // treat MaxFetchRetries as the TOTAL attempt count: exactly 3.
    assert.strictEqual(
      calls,
      3,
      `expected exactly 3 total HTTP attempts (main parity), got ${calls}`
    );
  } finally {
    restore();
  }
});
