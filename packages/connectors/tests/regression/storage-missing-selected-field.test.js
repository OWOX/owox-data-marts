// A field the Data Mart selects that the connector's schema no longer has — usually a custom
// connector edited after the Data Mart was set up — failed the first run with "Required field
// timezone not found in schema", which reads as an engine problem and says nothing of the fix.
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

function makeStorage(name) {
  const { Core, Storages } = OWOX;
  const context = new Core.AbstractContext({
    source: { name: 'Test', config: { Fields: { value: 'report timezone, report id' } } },
    storage: { name, config: {} },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
  const schema = { id: { type: 'integer' } };
  return new Storages[name][`${name}Storage`](context, ['id'], schema, null);
}

for (const name of ['GoogleBigQuery', 'Snowflake', 'Databricks']) {
  test(`${name}: a selected field the connector does not provide names the field and the fix`, async () => {
    await assert.rejects(
      () => makeStorage(name).createTableIfItDoesntExist(),
      err =>
        /Field "timezone" is selected for import, but the connector does not provide it/.test(
          err.message
        ) && /Edit Fields/.test(err.message)
    );
  });
}
