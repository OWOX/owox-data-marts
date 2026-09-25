import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { withBuildLock, buildBundle } from '../buildBundleOnce.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');

before(() => {
  withBuildLock(() => {
    buildBundle(pkgRoot);
  });
});

function runRunner(env) {
  return new Promise(resolve => {
    const child = spawn(
      'node',
      ['--no-deprecation', path.join(pkgRoot, 'dist', 'connector-runner.cjs')],
      {
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let out = '';
    child.stdout.on('data', chunk => (out += chunk.toString()));
    child.stderr.on('data', chunk => (out += chunk.toString()));
    child.on('close', () => resolve(out));
  });
}

// A key an API takes in the path ends up in the error, which reaches the run's error and log
// through both the CONTROL event and the runner's failure envelope.
test('a secret in a failed request path reaches neither the run log nor the run error', async () => {
  const secret = 'sk_live_4f2b9a7c1d';
  const manifest = {
    version: '1.0',
    name: 'PathKey',
    baseUrl: 'https://api.example.com',
    parameters: { ApiKey: { requiredType: 'string', isRequired: true, attributes: ['SECRET'] } },
    nodes: {
      items: {
        uniqueKeys: ['id'],
        request: { method: 'GET', path: '{{ parameters.ApiKey }}/items' },
        recordSelector: { recordPath: [] },
        fields: { id: { type: 'string' } },
      },
    },
  };
  const out = await runRunner({
    OW_DATAMART_ID: 'dm',
    OW_RUN_ID: 'run',
    OW_TEST: '1',
    OW_MANIFEST: JSON.stringify(manifest),
    OW_CONFIG: JSON.stringify({
      source: {
        name: 'PathKey',
        config: { ApiKey: { value: secret }, Fields: { value: 'items id' } },
      },
      storage: { name: 'Unused', config: {} },
    }),
    OW_RUN_CONFIG: JSON.stringify({ type: 'INCREMENTAL', data: [], state: {} }),
  });

  assert.match(out, /path must start with/, out);
  assert.ok(!out.includes(secret), out);
});
