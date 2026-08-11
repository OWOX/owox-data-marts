// packages/connectors/tests/regression/oauth-authtype-validate.test.js
//
// Regression test for G1: AbstractContext.validate() lost main's
// `if (param.oneOf) { _validateOneOf(); continue; }` routing. Any source
// with an OAuth-style `oneOf` selector param (e.g. GoogleAdsSource's
// `AuthType`, declared with `requiredType: 'object'`) hit the generic
// `_validateParameterType('object', ...)` branch instead, which tried
// `JSON.parse("oauth2")` on the selector's own string value and threw
// `Parameter "AuthType" must be valid JSON, got: oauth2` -- so validate()
// could never succeed for ANY connector using the oneOf/AuthType pattern
// (GoogleAds, MicrosoftAds, FacebookMarketing, LinkedInAds, TikTokAds,
// LinkedInPages all declare one). Fixed by restoring the oneOf routing (see
// AbstractContext.js's `_validateOneOf`).
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

test('GoogleAdsSource: AuthType oneOf selector ("oauth2") passes validate() without a JSON-parse throw', () => {
  const { Core, GoogleAds } = OWOX;
  const ctx = new Core.AbstractContext({
    source: {
      name: 'GoogleAds',
      config: {
        CustomerId: { value: '123-456-7890' },
        Fields: { value: ['campaign.id'] },
        AuthType: {
          value: 'oauth2',
          items: {
            RefreshToken: { value: 'refresh-token' },
            ClientId: { value: 'client-id' },
            ClientSecret: { value: 'client-secret' },
            DeveloperToken: { value: 'developer-token' },
          },
        },
      },
    },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });

  new GoogleAds.GoogleAdsSource(ctx);

  assert.doesNotThrow(() => ctx.validate());
  // the selector's own value must be left as the string "oauth2", not mangled
  // by a stray JSON.parse attempt.
  assert.equal(ctx.getParameter('AuthType').value, 'oauth2');
});

test('GoogleAdsSource: AuthType oneOf selector rejects an unknown value with a clear message', () => {
  const { Core, GoogleAds } = OWOX;
  const ctx = new Core.AbstractContext({
    source: {
      name: 'GoogleAds',
      config: {
        CustomerId: { value: '123-456-7890' },
        Fields: { value: ['campaign.id'] },
        AuthType: { value: 'not-a-real-option' },
      },
    },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });

  new GoogleAds.GoogleAdsSource(ctx);

  assert.throws(() => ctx.validate(), /invalid value 'not-a-real-option'/);
});
