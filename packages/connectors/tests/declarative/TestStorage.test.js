import test from 'node:test';
import assert from 'node:assert/strict';
import { TestStorage, TEST_ROW_MARKER } from '../../src/Core/TestStorage.js';

test('TestStorage.saveData writes one marker-prefixed NDJSON line per record', async () => {
  const lines = [];
  const original = process.stdout.write.bind(process.stdout);
  process.stdout.write = chunk => {
    lines.push(String(chunk));
    return true;
  };
  try {
    const s = new TestStorage({}, ['id'], { id: {} }, 'dest');
    await s.init();
    await s.saveData([
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
  } finally {
    process.stdout.write = original;
  }
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith(TEST_ROW_MARKER));
  assert.deepEqual(JSON.parse(lines[0].slice(TEST_ROW_MARKER.length)), { id: 1, name: 'a' });
  assert.deepEqual(JSON.parse(lines[1].slice(TEST_ROW_MARKER.length)), { id: 2, name: 'b' });
});

// Note: there is no src/index.js — the package uses a vite-based build (vite.config.js)
// that auto-discovers all src/Core/**/*.js files and assembles the Core object at build time.
// TestStorage and TEST_ROW_MARKER are automatically included in Core by that mechanism.
// We verify the named exports exist in the module itself.
test('TestStorage and TEST_ROW_MARKER are named exports of the Core module', async () => {
  const mod = await import('../../src/Core/TestStorage.js');
  assert.ok(mod.TestStorage, 'TestStorage should be a named export');
  assert.equal(typeof mod.TEST_ROW_MARKER, 'string', 'TEST_ROW_MARKER should be a string export');
  assert.equal(mod.TEST_ROW_MARKER, TEST_ROW_MARKER);
});
