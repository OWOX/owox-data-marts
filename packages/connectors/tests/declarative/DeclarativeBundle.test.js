import assert from 'node:assert';
import { describe, it, before } from 'node:test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { withBuildLock, buildBundle } from '../buildBundleOnce.js';
import { ConnectorBuilder } from '../../vite.config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');
const requireCjs = createRequire(import.meta.url);

describe('Declarative connector through the built bundle', () => {
  let owox;
  // Under the build lock, as every other test that rebuilds dist/ is: a sibling file
  // rebuilding at the same time otherwise hands this one a half-written bundle.
  before(() => {
    withBuildLock(() => {
      buildBundle(pkgRoot);
      owox = requireCjs(path.join(pkgRoot, 'dist', 'index.cjs'));
    });
  });

  it('exposes DeclarativeSource and ManifestParser in Core', () => {
    assert.ok(owox.Core.DeclarativeSource, 'Core.DeclarativeSource missing from bundle');
    assert.ok(owox.Core.ManifestParser, 'Core.ManifestParser missing from bundle');
  });

  // The bundler concatenates every Core file into one scope and strips all
  // top-level `import ... from '...'` lines (ConnectorBuilder.processEntityFile
  // in vite.config.js). SsrfGuard is the only Core file importing a node
  // builtin, so its default DNS resolver was the only binding that vanished
  // from dist/ -- leaving a call to an undefined `dnsLookup`. The ReferenceError
  // that produced was swallowed by _assertResolvesToPublic's bare catch, which
  // failed OPEN, so the anti-DNS-rebinding check silently never ran in the
  // shipped bundle while every unit test (which imports the ESM source
  // directly, imports intact) stayed green.
  //
  // ".invalid" is reserved by RFC 2606 and never resolves, so this asserts the
  // resolver is WIRED UP without needing a network or a real lookup to succeed.
  it('the bundled SsrfGuard has a working default DNS resolver', async () => {
    const guard = new owox.Core.SsrfGuard(['nonexistent.invalid']);
    const err = await guard.lookup('nonexistent.invalid').then(
      () => null,
      e => e
    );
    assert.ok(err, '.invalid never resolves, so the default lookup must reject');
    assert.ok(
      !(err instanceof ReferenceError),
      `the default DNS resolver is not wired up in the bundle: ${err.message}`
    );
    assert.ok(
      typeof err.code === 'string' && err.code.length > 0,
      `expected a DNS error carrying a code, got: ${err.message}`
    );
  });
});

// No connector in src/Sources/ is a manifest alone, so the build's path for one runs against
// a fixture tree laid out the same way.
describe('Build discovery of a connector that is only a manifest', () => {
  const discover = tree => {
    const builder = new ConnectorBuilder();
    builder.rootDir = path.join(__dirname, 'fixtures', 'bundled', tree);
    return builder.discoverConnectors();
  };

  it('bundles a directory holding only a manifest with nodes as a declarative connector', async () => {
    const [connector] = await discover('valid');

    assert.strictEqual(connector.name, 'ExampleRates');
    assert.strictEqual(connector.isDeclarative, true);
    assert.deepStrictEqual(connector.files, []);
    assert.ok(connector.manifest.nodes.latest, 'the manifest travels with the connector');
  });

  it('fails the build on a manifest the declarative engine would refuse', async () => {
    await assert.rejects(
      discover('invalid'),
      /Connector "Broken": declarative manifest is invalid/
    );
  });
});
