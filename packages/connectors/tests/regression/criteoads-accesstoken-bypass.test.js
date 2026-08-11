// packages/connectors/tests/regression/criteoads-accesstoken-bypass.test.js
//
// Regression test for G12c: CriteoAdsSource's constructor always seeds
// `_accessTokenRefreshAt = 0`, so `_hasReusableAccessToken()` (which requires
// `Date.now() < this._accessTokenRefreshAt`) is always false on a fresh
// instance -- even when a manually-supplied AccessToken value is already
// present in config. getAccessToken() then always fetches a fresh
// client-credentials token, silently discarding the supplied one. main
// honored a pre-supplied AccessToken as-is until Criteo itself reported it
// expired.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { withBuildLock, buildBundle } from '../buildBundleOnce.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');

let OWOX;

before(() => {
  withBuildLock(() => {
    buildBundle(pkgRoot);
    OWOX = require(path.join(pkgRoot, 'dist', 'index.cjs'));
  });
});

function contextWithAccessToken(accessTokenValue) {
  const config = accessTokenValue !== undefined ? { AccessToken: { value: accessTokenValue } } : {};
  return {
    emit() {},
    log() {},
    registerParameters() {},
    getParameter(name) {
      if (name === 'AccessToken') {
        return config.AccessToken || null;
      }
      return null;
    },
  };
}

test('a manually-supplied AccessToken is honored without a forced token fetch', () => {
  const { CriteoAds } = OWOX;
  const source = new CriteoAds.CriteoAdsSource(contextWithAccessToken('pre-supplied-token'));

  assert.equal(
    source._hasReusableAccessToken(),
    true,
    'expected a pre-supplied AccessToken to be reusable without a fetch'
  );
});

test('no AccessToken supplied: _hasReusableAccessToken() is false (a fetch is still required)', () => {
  const { CriteoAds } = OWOX;
  const source = new CriteoAds.CriteoAdsSource(contextWithAccessToken(undefined));

  assert.equal(source._hasReusableAccessToken(), false);
});
