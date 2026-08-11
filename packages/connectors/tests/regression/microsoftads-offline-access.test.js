// packages/connectors/tests/regression/microsoftads-offline-access.test.js
//
// Regression test for G8: MicrosoftAdsSource.getAccessToken()'s refresh-token
// grant scopes lost ` offline_access` during the connector architecture
// redesign (main has it on both the "new" and "old" scope strings; see
// `git show main:packages/connectors/src/Sources/MicrosoftAds/Source.js`
// around the getAccessToken scopes array). The initial code-exchange scope
// (exchangeOauthCredentials) still carries it -- only the refresh-grant scope
// list regressed. Without `offline_access` on the refresh grant, Microsoft
// won't reliably return a rotated `refresh_token`, silently breaking the
// long-lived-connection story documented on getAccessToken().
//
// We drive this end-to-end through the built bundle: construct a real
// MicrosoftAdsSource, stub global.fetch to capture every outgoing
// x-www-form-urlencoded request body, call getAccessToken(), and assert the
// captured `scope` field contains `offline_access` for the (successful,
// first-tried) request.
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

function makeSource() {
  const { Core, MicrosoftAds } = OWOX;
  const ctx = new Core.AbstractContext({
    source: {
      name: 'MicrosoftAds',
      config: {
        ClientID: { value: 'client-id' },
        ClientSecret: { value: 'client-secret' },
        RefreshToken: { value: 'refresh-token' },
        DeveloperToken: { value: 'developer-token' },
        AccountIDs: { value: '123456789' },
        CustomerID: { value: '987654321' },
        Fields: { value: ['campaigns campaign_id'] },
      },
    },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });

  return new MicrosoftAds.MicrosoftAdsSource(ctx);
}

function parseFormBody(body) {
  return Object.fromEntries(body.split('&').map(pair => pair.split('=').map(decodeURIComponent)));
}

test('MicrosoftAdsSource.getAccessToken() sends offline_access in the refresh-grant scope', async () => {
  const source = makeSource();
  const capturedScopes = [];

  global.fetch = async (url, options) => {
    const form = parseFormBody(options.body);
    capturedScopes.push(form.scope);
    return {
      text: async () =>
        JSON.stringify({
          access_token: 'new-access-token',
          refresh_token: 'rotated-refresh-token',
        }),
    };
  };

  await source.getAccessToken();

  assert.ok(
    capturedScopes.length > 0,
    'expected getAccessToken() to issue at least one token request'
  );
  for (const scope of capturedScopes) {
    assert.match(
      scope,
      /\boffline_access\b/,
      `refresh-grant scope must contain "offline_access" so Microsoft reliably rotates the refresh_token, got: ${scope}`
    );
  }
});
