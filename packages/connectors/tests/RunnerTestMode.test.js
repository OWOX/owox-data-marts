import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildBundle, withBuildLockAsync } from './buildBundleOnce.js';

const require = createRequire(import.meta.url);

const spawnRunner = ({ manifest, sourceConfig = {}, env = {} }) => {
  const runnerPath = require.resolve('@owox/connectors/runner');
  const childEnv = {
    ...process.env,
    OW_DATAMART_ID: 'test',
    OW_RUN_ID: 'test',
    OW_TEST: '1',
    OW_TEST_MAX_ROWS: '5',
    OW_TEST_MAX_PAGES: '1',
    OW_MANIFEST: JSON.stringify(manifest),
    OW_CONFIG: JSON.stringify({
      source: { name: 'Smoke', config: sourceConfig },
      storage: { name: 'NoSuch', config: {} },
    }),
    OW_RUN_CONFIG: JSON.stringify({ type: 'INCREMENTAL', data: [], state: {} }),
    ...env,
  };
  return new Promise(resolve => {
    const child = spawn('node', ['--no-deprecation', runnerPath], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buf = '';
    child.stdout.on('data', d => (buf += d.toString()));
    child.stderr.on('data', d => (buf += d.toString()));
    child.on('close', () => resolve(buf));
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve(buf);
    }, 15000);
  });
};

// Under the build lock: a sibling test file's rebuild deletes dist/ before it writes it again.
const runRunner = options =>
  withBuildLockAsync(() => {
    if (!existsSync(new URL('../dist/connector-runner.cjs', import.meta.url))) {
      buildBundle(fileURLToPath(new URL('..', import.meta.url)));
    }
    return spawnRunner(options);
  });

const smokeManifest = (extra = {}) => ({
  version: '1.0',
  name: 'Smoke',
  baseUrl: 'https://127.0.0.1',
  parameters: {},
  nodes: {
    items: {
      request: { method: 'GET', path: '/x' },
      recordSelector: { recordPath: ['data'] },
      fields: { a: { type: 'string' } },
    },
  },
  ...extra,
});

test('runner OW_TEST mode skips real-storage resolution (uses TestStorage)', async () => {
  const out = await runRunner({ manifest: smokeManifest() });
  assert.ok(!/Storage class .* not found/.test(out), `unexpected storage error:\n${out}`);
});

test('OW_KEY_PARAMETERS is passed to DeclarativeSource', async () => {
  const manifest = smokeManifest({
    parameters: { ApiKey: { requiredType: 'string' } },
    accounts: { from: '{{ parameters.ApiKey }}' },
  });
  const sourceConfig = { ApiKey: { value: 'sk_live_4f2b9a' } };

  const restricted = await runRunner({
    manifest,
    sourceConfig,
    env: { OW_KEY_PARAMETERS: '["ApiKey"]' },
  });
  assert.match(restricted, /Key parameter \\?"ApiKey\\?" cannot be used in accounts\.from/);
  assert.doesNotMatch(restricted, /sk_live_4f2b9a/);

  const unrestricted = await runRunner({ manifest, sourceConfig });
  assert.doesNotMatch(unrestricted, /Key parameter/);
});

test('fails the run when OW_KEY_PARAMETERS is not a JSON array of names', async () => {
  for (const value of ['', 'ApiKey', '{"ApiKey":true}', '[1]']) {
    const out = await runRunner({
      manifest: smokeManifest(),
      env: { OW_KEY_PARAMETERS: value },
    });
    assert.match(out, /OW_KEY_PARAMETERS must be a JSON array of parameter names/, value);
  }
});
