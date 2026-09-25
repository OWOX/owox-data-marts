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

// The setup form lists a source's declared parameters, and main declared these two for every
// connector; the Facebook troubleshooting guide sends users to them.
test('every bundled source offers the retry settings under Advanced settings', () => {
  const { Core, AvailableConnectors } = OWOX;
  const names = AvailableConnectors.filter(name => OWOX[name]?.[`${name}Source`]);
  assert.ok(names.length >= 15, names.join(', '));

  for (const name of names) {
    const context = new Core.AbstractContext({
      source: { name, config: {} },
      storage: { name: 'unused', config: {} },
      runConfig: {},
      env: { datamartId: null, runId: null },
    });
    const { parameters } = new OWOX[name][`${name}Source`](context);

    assert.equal(parameters.MaxFetchRetries?.label, 'Max Fetch Retries', name);
    assert.equal(parameters.InitialRetryDelay?.label, 'Initial Retry Delay (ms)', name);
    assert.deepEqual(parameters.MaxFetchRetries.attributes, ['ADVANCED'], name);
    assert.deepEqual(parameters.InitialRetryDelay.attributes, ['ADVANCED'], name);
    assert.equal(context.getParameter('MaxFetchRetries')?.value, 3, name);
    assert.equal(context.getParameter('InitialRetryDelay')?.value, 5000, name);
  }
});
