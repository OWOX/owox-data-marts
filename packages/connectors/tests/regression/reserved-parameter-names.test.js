// A manifest parameter cannot take the name of a destination storage's setting: the two share
// one context and the source's value wins. The parser keeps its own list of those names, so
// this checks it against what every bundled storage declares, and fails the day a storage
// gains a setting the list does not know.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';
import { withBuildLock, buildBundle } from '../buildBundleOnce.js';
import { RESERVED_PARAMETER_NAMES } from '../../src/Core/Declarative/ManifestParser.js';

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

test('every setting a bundled storage declares is a reserved parameter name', () => {
  const storages = Object.values(OWOX)
    .filter(module => module && typeof module === 'object')
    .flatMap(module => Object.entries(module))
    .filter(([name, value]) => typeof value === 'function' && /Storage$/.test(name));
  assert.ok(storages.length >= 5, `found only ${storages.length} storages in the bundle`);

  const missing = storages.flatMap(([storage, StorageClass]) =>
    Object.keys(StorageClass.parameters || {})
      .filter(name => !RESERVED_PARAMETER_NAMES.has(name))
      .map(name => `${storage}.${name}`)
  );
  assert.deepEqual(missing, []);
});
