import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

test('runner OW_TEST mode skips real-storage resolution (uses TestStorage)', async () => {
  const runnerPath = require.resolve('@owox/connectors/runner');
  const manifest = {
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
  };
  const env = {
    ...process.env,
    OW_DATAMART_ID: 'test',
    OW_RUN_ID: 'test',
    OW_TEST: '1',
    OW_TEST_MAX_ROWS: '5',
    OW_TEST_MAX_PAGES: '1',
    OW_MANIFEST: JSON.stringify(manifest),
    OW_CONFIG: JSON.stringify({
      source: { name: 'Smoke', config: {} },
      storage: { name: 'NoSuch', config: {} },
    }),
    OW_RUN_CONFIG: JSON.stringify({ type: 'INCREMENTAL', data: [], state: {} }),
  };
  const out = await new Promise(resolve => {
    const child = spawn('node', ['--no-deprecation', runnerPath], {
      env,
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
  assert.ok(!/Storage class .* not found/.test(out), `unexpected storage error:\n${out}`);
});
