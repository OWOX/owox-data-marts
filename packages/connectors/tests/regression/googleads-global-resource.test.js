// A global resource (geo_target_constants) returns the same rows for every customer, so
// GoogleAdsSource fetches it for one account only. It used to mark the node done before the
// request, so when the first account could not read it, every later account skipped it and
// the run imported nothing for the node.
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
  const { Core, GoogleAds } = OWOX;
  const context = new Core.AbstractContext({
    source: {
      name: 'GoogleAds',
      config: { CustomerId: { value: '111,222,333' }, Fields: { value: [] } },
    },
    storage: { name: 'GoogleBigQueryStorage', config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
  context.log = () => {};
  return new GoogleAds.GoogleAdsSource(context);
}

const request = accountId => ({
  nodeName: 'geo_target_constants',
  fields: ['geo_target_constant_id'],
  accountId,
  startDate: null,
  endDate: null,
});

test('GoogleAdsSource: a global resource the first account could not read is read by the next', async () => {
  const source = makeSource();
  const asked = [];
  source.makeRequest = async ({ customerId }) => {
    asked.push(customerId);
    if (customerId === '111') throw Object.assign(new Error('HTTP 403'), { statusCode: 403 });
    return [{ geo_target_constant_id: 2840 }];
  };

  await assert.rejects(() => source.fetchData(request('111')), /403/);
  assert.deepEqual(await source.fetchData(request('222')), [{ geo_target_constant_id: 2840 }]);
  assert.deepEqual(await source.fetchData(request('333')), []);
  assert.deepEqual(asked, ['111', '222']);
});
