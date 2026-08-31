// packages/connectors/tests/regression/facebook-retry-payload.test.js
//
// Regression test for G7a: AbstractSource.urlFetchWithRetry() (Core/AbstractSource.js
// ~255-274) builds the error for a non-ok HTTP response with `.response` /
// `.statusCode` / `.responseBody` (the raw response text) but never attaches
// the parsed JSON body as `.payload`. On main, the HTTP layer attached
// `.payload` for every non-ok JSON response.
//
// FacebookMarketingSource.isValidToRetry() (Source.js ~288-309) reads
// `error.payload.error` to detect FB rate-limit/transient error codes (e.g.
// code 4 = rate limit, `is_transient: true`). Without `.payload`, that check
// always falls through to `return false` for any 4xx FB error body -- so a
// rate-limited/transient FB response was never retried, silently aborting a
// backfill instead of backing off and continuing, as it did on main.
//
// This test drives both ends of the regression:
//  1. urlFetchWithRetry() itself must attach the parsed body as `.payload`.
//  2. FacebookMarketingSource, given the real (mocked) HTTP round trip, must
//     then actually RETRY a transient FB rate-limit response instead of
//     aborting after a single attempt.
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

// Minimal fake context -- urlFetchWithRetry/isValidToRetry only touch
// emit/log/getParameter/registerParameters; a full AbstractContext (with its
// storage-config requirements) isn't needed for this contract.
function fakeContext() {
  return {
    emit() {},
    log() {},
    getParameter() {
      return null;
    },
    registerParameters() {},
  };
}

function fakeNonOkResponse(status, statusText, bodyObj) {
  const bodyText = JSON.stringify(bodyObj);
  return {
    ok: false,
    status,
    statusText,
    headers: { get: () => null },
    text: async () => bodyText,
  };
}

test('urlFetchWithRetry() attaches the parsed JSON error body as error.payload for a non-ok response', async () => {
  const { Core } = OWOX;
  // Default AbstractSource.isValidToRetry() returns false -- this throws on
  // the very first attempt, no retry delay involved.
  const source = new Core.AbstractSource(fakeContext());

  global.fetch = async () =>
    fakeNonOkResponse(400, 'Bad Request', { error: { code: 4, is_transient: true } });

  await assert.rejects(
    () => source.urlFetchWithRetry('https://graph.facebook.com/v25.0/x', { method: 'GET' }),
    error => {
      assert.equal(error.statusCode, 400);
      assert.ok(
        error.payload,
        'expected urlFetchWithRetry to attach a parsed error.payload; got undefined'
      );
      assert.equal(error.payload.error.code, 4);
      return true;
    }
  );
});

test('FacebookMarketingSource retries a transient FB rate-limit response instead of aborting after one attempt', async () => {
  const { FacebookMarketing } = OWOX;
  const source = new FacebookMarketing.FacebookMarketingSource(fakeContext());
  // Skip the real exponential backoff wait -- we only care how many times
  // fetch was called, not wall-clock timing.
  source._delay = () => Promise.resolve();

  let calls = 0;
  global.fetch = async () => {
    calls++;
    // Always fails with FB's rate-limit error code (4), which FacebookMarketing's
    // isValidToRetry() treats as retryable via error.payload.error.is_transient/code.
    return fakeNonOkResponse(400, 'Bad Request', {
      error: { code: 4, is_transient: true, message: 'rate limited' },
    });
  };

  await assert.rejects(
    () =>
      source.urlFetchWithRetry('https://graph.facebook.com/v25.0/act_123/insights', {
        method: 'GET',
      }),
    error => {
      assert.equal(error.payload.error.code, 4);
      return true;
    }
  );

  assert.ok(
    calls > 1,
    `expected FacebookMarketingSource to retry a transient (rate-limit) FB error instead of aborting after one attempt, but fetch was called ${calls} time(s)`
  );
});
