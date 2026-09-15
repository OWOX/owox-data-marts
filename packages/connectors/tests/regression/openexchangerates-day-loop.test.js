// packages/connectors/tests/regression/openexchangerates-day-loop.test.js
//
// Regression test for G7b: OpenExchangeRatesSource uses the shared
// AbstractSource.urlFetchWithRetry() (which throws on a non-ok response) but
// never overrides isValidToRetry(), so it inherits AbstractSource's default
// (`return false`, see Core/AbstractSource.js ~364). A single transient
// 429/5xx from the historical-rates endpoint therefore aborts the ENTIRE
// day-by-day backfill instead of retrying that one day and continuing -- on
// main, the old muteHttpExceptions-based fetch swallowed the failure (empty
// rates -> skip day -> continue). The sibling connectors CriteoAds/RedditAds
// /Shopify/XAds already override isValidToRetry for exactly this reason (see
// e.g. CriteoAdsSource.isValidToRetry() in ../../src/Sources/CriteoAds/Source.js).
//
// This test asserts both ends of the regression:
//  1. OpenExchangeRatesSource.prototype.isValidToRetry exists and classifies
//     429/5xx as retryable (and a genuine 4xx client error as not).
//  2. fetchData() actually retries a transient 429 for a single day instead
//     of throwing immediately.
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { withBuildLock, buildBundle } from '../buildBundleOnce.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');

let OWOX;
let originalFetch;

before(() => {
  withBuildLock(() => {
    buildBundle(pkgRoot);
    OWOX = require(path.join(pkgRoot, 'dist', 'index.cjs'));
  });
});

beforeEach(() => {
  originalFetch = global.fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

// Minimal fake context -- fetchData/urlFetchWithRetry/isValidToRetry only
// touch emit/log/getParameter/registerParameters; a full AbstractContext
// (with its storage-config requirements) isn't needed for this contract.
function fakeContext(paramValues = {}) {
  return {
    emit() {},
    log() {},
    registerParameters() {},
    getParameter(name) {
      return Object.prototype.hasOwnProperty.call(paramValues, name)
        ? { value: paramValues[name] }
        : null;
    },
  };
}

function makeSource(paramValues) {
  const { OpenExchangeRates } = OWOX;
  return new OpenExchangeRates.OpenExchangeRatesSource(fakeContext(paramValues));
}

test('OpenExchangeRatesSource.isValidToRetry() treats 429 and 5xx as retryable, other 4xx as not', () => {
  const source = makeSource({});

  assert.equal(
    source.isValidToRetry({ statusCode: 429 }),
    true,
    'expected 429 (rate limit) to be retryable'
  );
  assert.equal(
    source.isValidToRetry({ statusCode: 500 }),
    true,
    'expected 500 (server error) to be retryable'
  );
  assert.equal(
    source.isValidToRetry({ statusCode: 503 }),
    true,
    'expected 503 (server error) to be retryable'
  );
  assert.equal(
    source.isValidToRetry({ statusCode: 400 }),
    false,
    'expected 400 (bad request) to NOT be retryable'
  );
  // Native network failures (DNS/ECONNRESET/timeout) have no statusCode -> retry (main parity + sibling connectors).
  assert.equal(
    source.isValidToRetry({ message: 'ECONNRESET' }),
    true,
    'expected a no-statusCode network error to be retryable'
  );
  assert.equal(
    source.isValidToRetry({}),
    true,
    'expected an empty/no-statusCode error to be retryable'
  );
});

test('fetchData() retries a transient 429 for a single day instead of aborting the whole backfill', async () => {
  const source = makeSource({ base: 'USD', AppId: 'app-id-123' });
  // Skip the real exponential backoff wait -- we only care that a retry
  // happens, not wall-clock timing.
  source._delay = () => Promise.resolve();

  let calls = 0;
  global.fetch = async () => {
    calls++;
    if (calls === 1) {
      return {
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: { get: () => null },
        text: async () => JSON.stringify({ error: true, message: 'rate limit exceeded' }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ rates: { EUR: 0.9, GBP: 0.8 } }),
    };
  };

  const rows = await source.fetchData({
    nodeName: 'rates',
    fields: [],
    accountId: null,
    startDate: '2024-01-01',
    endDate: '2024-01-01',
  });

  assert.ok(
    calls > 1,
    `expected fetchData() to retry after the transient 429 instead of aborting, but fetch was called ${calls} time(s)`
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.currency).sort(), ['EUR', 'GBP']);
});
