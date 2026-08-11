// packages/connectors/tests/regression/linkedinads-account-id.test.js
//
// Regression test for G9: LinkedInAdsSource.getAccounts() bakes the full
// `urn:li:sponsoredAccount:<id>` into `account.id` instead of a bare numeric
// id. That URN then flows straight into AbstractConnector's catalog-node
// fetch URLs (e.g. `fetchAdResource`'s
// `${BASE_URL}adAccounts/${encodeURIComponent(urn)}/adCampaigns`), producing
// `/adAccounts/urn%3Ali%3AsponsoredAccount%3A.../adCampaigns` -- which
// LinkedIn rejects (400/404).
//
// main avoided this: `LinkedInAdsConnector.startImportProcess()` calls
// `FormatUtils.parseIds(this.config.AccountURNs.value, { prefix:
// 'urn:li:sponsoredAccount:' })`, which STRIPS the prefix, and only
// `fetchAdAnalytics` re-adds `urn:li:sponsoredAccount:` locally (the only
// LinkedIn endpoint that needs the URN form, as a query param rather than a
// URL path segment). The sibling LinkedInPages/Source.js
// (`getAccounts`/`fetchOrganizationStats`) already does this correctly and
// is the reference shape.
//
// This test asserts `getAccounts()` returns a BARE numeric account id (no
// `urn:` prefix) -- the invariant every catalog-node URL builder in this
// source relies on.
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

function makeContext(sourceConfig) {
  const { Core } = OWOX;
  return new Core.AbstractContext({
    source: { name: 'LinkedInAds', config: sourceConfig },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
}

test('LinkedInAdsSource.getAccounts() returns bare numeric account ids, not the full sponsoredAccount URN', () => {
  const { LinkedInAds } = OWOX;
  const ctx = makeContext({
    ClientID: { value: 'client-id' },
    ClientSecret: { value: 'client-secret' },
    RefreshToken: { value: 'refresh-token' },
    AccountURNs: { value: 'urn:li:sponsoredAccount:123456789' },
    Fields: { value: ['adCampaigns id'] },
  });

  const source = new LinkedInAds.LinkedInAdsSource(ctx);
  const accounts = source.getAccounts(ctx);

  assert.equal(accounts.length, 1);
  assert.equal(
    String(accounts[0].id),
    '123456789',
    `expected a bare numeric account id (no urn: prefix) so catalog-node URLs like ` +
      `adAccounts/{id}/adCampaigns build correctly; got: ${accounts[0].id}`
  );
});

test('LinkedInAdsSource.getAccounts() accepts multiple comma-separated URNs and strips each prefix', () => {
  const { LinkedInAds } = OWOX;
  const ctx = makeContext({
    ClientID: { value: 'client-id' },
    ClientSecret: { value: 'client-secret' },
    RefreshToken: { value: 'refresh-token' },
    AccountURNs: { value: 'urn:li:sponsoredAccount:111,urn:li:sponsoredAccount:222' },
    Fields: { value: ['adCampaigns id'] },
  });

  const source = new LinkedInAds.LinkedInAdsSource(ctx);
  const accounts = source.getAccounts(ctx);

  assert.deepEqual(
    accounts.map(a => String(a.id)),
    ['111', '222']
  );
});
