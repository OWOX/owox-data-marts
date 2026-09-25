// adAnalytics does not paginate and stops at 15000 elements, so a day that reaches the cap may
// be missing rows. main reported those days once per account per run; the branch logged a
// WARN for every day, and every WARN line becomes one of the run's warnings, so a saturated
// account over a long backfill buried the run under one warning per day.
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
        Fields: { value: ['adAnalytics impressions'] },
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
  source.makeRequest = async () => ({
    elements: Array.from({ length: source.MAX_RESPONSE_ELEMENTS }, (_, i) => ({
      dateRange: { start: { year: 2026, month: 1, day: 1 }, end: { year: 2026, month: 1, day: 1 } },
      pivotValues: [`urn:li:sponsoredCampaign:${i}`],
      impressions: 1,
    })),
  });
  return { source, warnings };
}

const day = date => ({
  nodeName: 'adAnalytics',
  fields: ['dateRangeStart', 'dateRangeEnd', 'pivotValues', 'impressions'],
  accountId: '123',
  startDate: date,
  endDate: date,
});

test('LinkedInAdsSource: days cut short by the element cap make one warning per account', async () => {
  const { source, warnings } = makeSource();

  await source.fetchData(day('2026-01-01'));
  await source.fetchData(day('2026-01-02'));
  assert.deepEqual(warnings, []);

  source.onAccountComplete({ id: '123' });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /account 123 .* on 2 day\(s\): 2026-01-01, 2026-01-02;/);
});

test('LinkedInAdsSource: the warning lists ten days and counts the rest', async () => {
  const { source, warnings } = makeSource();

  for (let d = 1; d <= 12; d++) {
    await source.fetchData(day(`2026-01-${String(d).padStart(2, '0')}`));
  }
  source.onAccountComplete({ id: '123' });

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /on 12 day\(s\): 2026-01-01, .*2026-01-10 and 2 more;/);
});
