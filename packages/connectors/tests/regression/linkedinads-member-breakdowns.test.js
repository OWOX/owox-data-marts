// Loads the built bundle, so the real constructor, the bundle order and a member node meet.
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

function makeSource() {
  const { Core, LinkedInAds } = OWOX;
  const context = new Core.AbstractContext({
    source: {
      name: 'LinkedInAds',
      config: {
        ClientID: { value: 'client-id' },
        ClientSecret: { value: 'client-secret' },
        RefreshToken: { value: 'refresh-token' },
        AccountURNs: { value: 'urn:li:sponsoredAccount:123' },
        Fields: { value: ['adAnalyticsByCompany impressions'] },
      },
    },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
  const warnings = [];
  context.log = (level, message) => {
    if (level === 'warn') warnings.push(message);
  };
  const source = new LinkedInAds.LinkedInAdsSource(context);
  const requests = [];
  source.makeRequest = async url => {
    requests.push(url);
    if (url.includes('adTargetingEntities')) {
      return { elements: [{ urn: 'urn:li:organization:1035', name: 'Microsoft' }] };
    }
    if (url.includes('pivot=CAMPAIGN&')) {
      return { elements: [{ pivotValues: ['urn:li:sponsoredCampaign:1'], impressions: 1 }] };
    }
    return {
      elements: [
        {
          dateRange: {
            start: { year: 2026, month: 1, day: 1 },
            end: { year: 2026, month: 1, day: 1 },
          },
          pivotValues: ['urn:li:organization:1035'],
          impressions: 10,
        },
      ],
    };
  };
  return { source, warnings, requests };
}

test('the bundled source reads a day of companies with their names', async () => {
  const { source, warnings, requests } = makeSource();

  const rows = await source.fetchData({
    nodeName: 'adAnalyticsByCompany',
    fields: ['dateRangeStart', 'dateRangeEnd', 'campaign', 'company', 'companyName', 'impressions'],
    accountId: '123',
    startDate: '2026-01-01',
    endDate: '2026-01-01',
  });

  assert.deepEqual(rows, [
    {
      campaign: 'urn:li:sponsoredCampaign:1',
      account: 'urn:li:sponsoredAccount:123',
      company: 'urn:li:organization:1035',
      companyName: 'Microsoft',
      impressions: 10,
      dateRangeStart: '2026-01-01',
      dateRangeEnd: '2026-01-01',
    },
  ]);
  source.onAccountComplete({ id: '123' });
  assert.deepEqual(warnings, []);
  assert.equal(requests.filter(u => u.includes('adTargetingEntities')).length, 1);
  assert.ok(requests.some(u => u.includes('pivot=MEMBER_COMPANY&')));
});

test('the bundled schema offers the company columns', () => {
  const { source } = makeSource();

  assert.deepEqual(Object.keys(source.fieldsSchema.adAnalyticsByCompany.fields).slice(0, 4), [
    'account',
    'campaign',
    'company',
    'companyName',
  ]);
});

test('the bundled source starts with the member state', () => {
  const { source } = makeSource();

  assert.equal(source.NAMES_PER_REQUEST, 50);
  assert.equal(source.MAX_URNS_IN_WARNING, 5);
  assert.ok(source.memberNames instanceof Map && source.memberNames.size === 0);
  assert.ok(source.memberGaps instanceof Map && source.memberGaps.size === 0);
  assert.equal(source.memberNamesUnavailable, false);
  assert.equal(source.memberNamesRejected, false);
  assert.equal(source.GEO_NAMES_PER_REQUEST, undefined);
  assert.equal(source.geoNames, undefined);
  assert.equal(source.geoGaps, undefined);
});

test('the bundled source warns with the node overview', async () => {
  const { source, warnings, requests } = makeSource();
  const makeRequest = source.makeRequest;
  source.makeRequest = async url =>
    url.includes('adTargetingEntities') ? { elements: [] } : makeRequest(url);

  await source.fetchData({
    nodeName: 'adAnalyticsByCompany',
    fields: ['dateRangeStart', 'dateRangeEnd', 'campaign', 'company', 'companyName', 'impressions'],
    accountId: '123',
    startDate: '2026-01-01',
    endDate: '2026-01-01',
  });
  source.onAccountComplete({ id: '123' });

  assert.ok(requests.length > 0);
  assert.deepEqual(warnings, [
    'LinkedIn returned no name for 1 value(s) in Ad Analytics by Company for account 123: urn:li:organization:1035; their name column is left empty',
  ]);
});
