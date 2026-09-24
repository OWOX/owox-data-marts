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

// Each async stats job costs a submit, a poll loop and a download, all for rows the MERGE would reject.
test('XAds stats_by_country refuses fields without its unique keys before any API request', async () => {
  const { Core, XAds } = OWOX;
  const context = new Core.AbstractContext({
    source: { name: 'XAds', config: { AdsApiDelay: { value: 0 } } },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
  const source = new XAds.XAdsSource(context);
  const requests = [];
  source._rawFetch = async requestPath => {
    requests.push(requestPath);
    return { data: [] };
  };
  source._rawPostFetch = async requestPath => {
    requests.push(requestPath);
    return { data: {} };
  };

  await assert.rejects(
    source.fetchData({
      nodeName: 'stats_by_country',
      accountId: 'acc1',
      fields: ['impressions'],
      startDate: '2026-08-10',
      endDate: '2026-08-10',
    }),
    /Missing required unique fields for 'stats_by_country'/
  );
  assert.deepEqual(requests, []);
});
