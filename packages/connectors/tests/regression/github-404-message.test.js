// packages/connectors/tests/regression/github-404-message.test.js
//
// Regression test for G12b: GitHubSource._makeRequest() (Source.js) calls
// urlFetchWithRetry(), which THROWS on a non-ok HTTP response (an Error with
// `.statusCode`) before _makeRequest ever gets a chance to parse the body and
// run its own `result.message === 'Not Found'` check. So a bad "owner/repo"
// surfaced as a generic "HTTP 404: Not Found" instead of main's friendly
// "The repository was not found..." message (main used muteHttpExceptions
// and parsed the body itself, so it always reached that check).
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

// Minimal fake context -- _makeRequest only touches emit/log/getParameter/registerParameters.
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

test('GitHubSource surfaces the friendly "repository not found" message on a 404, not a generic HTTP error', async () => {
  const { GitHub } = OWOX;
  const source = new GitHub.GitHubSource(fakeContext());

  global.fetch = async () => fakeNonOkResponse(404, 'Not Found', { message: 'Not Found' });

  await assert.rejects(
    () => source._makeRequest('repos/owner/does-not-exist'),
    error => {
      assert.match(
        error.message,
        /repository was not found/i,
        `expected the friendly "repository not found" message, got: ${error.message}`
      );
      return true;
    }
  );
});

test('GitHubSource leaves a non-404 HTTP error untouched', async () => {
  const { GitHub } = OWOX;
  const source = new GitHub.GitHubSource(fakeContext());

  global.fetch = async () => fakeNonOkResponse(500, 'Internal Server Error', { message: 'boom' });

  await assert.rejects(
    () => source._makeRequest('repos/owner/repo'),
    error => {
      assert.equal(error.statusCode, 500);
      assert.match(error.message, /HTTP 500/);
      return true;
    }
  );
});

test('GitHubSource still detects the in-body "Not Found" message on a 200 response', async () => {
  const { GitHub } = OWOX;
  const source = new GitHub.GitHubSource(fakeContext());

  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => null },
    json: async () => ({ message: 'Not Found' }),
    text: async () => JSON.stringify({ message: 'Not Found' }),
  });

  await assert.rejects(
    () => source._makeRequest('repos/owner/does-not-exist'),
    /repository was not found/i
  );
});
