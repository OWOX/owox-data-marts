// packages/connectors/tests/regression/GoogleBigQueryStorage.dottedDatasetId.test.js
//
// Regression test for the G2 follow-up fix: AbstractContext.registerParameters
// now stubs every declared storage parameter to `{ value: undefined }` (see
// AbstractContext.js), including no-default required params like
// DestinationProjectID/DestinationDatasetName/ProjectID. GoogleBigQueryStorage's
// constructor derives those three from a dotted `DestinationDatasetID` (e.g.
// "myproject.mydataset") by checking `this.context.storageConfig.<X> ===
// undefined` — but since registerParameters now pre-stubs an object there,
// that raw-property check was always false and the derivation never ran,
// so validate() threw "The parameter 'DestinationProjectID' is required but
// was provided with an empty value" for standalone/legacy dotted-shorthand
// configs. Fixed by checking `.value === undefined` instead.
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

function makeContext(storageConfig) {
  const { Core } = OWOX;
  return new Core.AbstractContext({
    source: { name: 'Test', config: {} },
    storage: { name: 'GoogleBigQuery', config: storageConfig },
    runConfig: null,
    env: { datamartId: 'dm', runId: 'run' },
  });
}

test('GoogleBigQueryStorage derives ProjectID/DestinationProjectID/DestinationDatasetName from a dotted DestinationDatasetID', () => {
  const { Storages } = OWOX;
  const ctx = makeContext({
    DestinationDatasetID: { value: 'myproj.myds' },
    // Unrelated to this fix: DestinationLocation has its own pre-existing
    // required-param quirk (isRequired: "US" is truthy but was never meant to
    // enforce a required check under legacy `== true` semantics), so it must
    // be supplied explicitly for validate() to reach the assertions below.
    DestinationLocation: { value: 'US' },
  });

  new Storages.GoogleBigQuery.GoogleBigQueryStorage(ctx, ['id'], null, null);

  // Derivation runs in the constructor, before validate().
  assert.equal(ctx.storageConfig.DestinationProjectID.value, 'myproj');
  assert.equal(ctx.storageConfig.DestinationDatasetName.value, 'myds');
  assert.equal(ctx.storageConfig.ProjectID.value, 'myproj');

  assert.doesNotThrow(() => ctx.validate());

  assert.equal(ctx.getParameter('DestinationProjectID').value, 'myproj');
  assert.equal(ctx.getParameter('DestinationDatasetName').value, 'myds');
  assert.equal(ctx.getParameter('ProjectID').value, 'myproj');
});

test('GoogleBigQueryStorage leaves explicit DestinationProjectID/DestinationDatasetName/ProjectID untouched even with a dotted DestinationDatasetID', () => {
  const { Storages } = OWOX;
  const ctx = makeContext({
    DestinationDatasetID: { value: 'myproj.myds' },
    DestinationLocation: { value: 'US' },
    DestinationProjectID: { value: 'explicit-project' },
    DestinationDatasetName: { value: 'explicit-dataset' },
    ProjectID: { value: 'explicit-project' },
  });

  new Storages.GoogleBigQuery.GoogleBigQueryStorage(ctx, ['id'], null, null);

  assert.equal(ctx.storageConfig.DestinationProjectID.value, 'explicit-project');
  assert.equal(ctx.storageConfig.DestinationDatasetName.value, 'explicit-dataset');
  assert.equal(ctx.storageConfig.ProjectID.value, 'explicit-project');

  assert.doesNotThrow(() => ctx.validate());
});
