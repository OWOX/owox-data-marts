import assert from 'node:assert';
import { describe, it, before } from 'node:test';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runFixture, checkExpectations } from '../fixture-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..', '..');
const requireCjs = createRequire(import.meta.url);

describe('Declarative connector through the built bundle', () => {
  let owox;
  before(() => {
    execSync('npm run build', { cwd: pkgRoot, stdio: 'ignore' });
    owox = requireCjs(path.join(pkgRoot, 'dist', 'index.cjs'));
  });

  it('exposes DeclarativeSource and ManifestParser in Core', () => {
    assert.ok(owox.Core.DeclarativeSource, 'Core.DeclarativeSource missing from bundle');
    assert.ok(owox.Core.ManifestParser, 'Core.ManifestParser missing from bundle');
  });

  it('bundles RatesDeclarative as a declarative connector (manifest with nodes)', () => {
    const c = owox.Connectors.RatesDeclarative;
    assert.ok(c, 'RatesDeclarative not in bundle');
    assert.ok(
      c.manifest && c.manifest.nodes && c.manifest.nodes.latest,
      'declarative manifest with nodes expected'
    );
    assert.strictEqual(
      c.RatesDeclarativeSource,
      undefined,
      'declarative connector should have no Source class'
    );
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

  it('replays the declarative connector end-to-end (live public API)', async () => {
    const fixture = {
      name: 'RatesDeclarative-live',
      definitionRun: {
        connector: {
          source: { name: 'RatesDeclarative', node: 'latest', fields: ['date', 'base'] },
          storage: { fullyQualifiedName: 'test.fixture.rates' },
        },
      },
      sourceCredentials: { Base: 'EUR' },
      storageType: 'MockStorage',
      storageCredentials: {},
      runState: {},
      expected: { controlAction: 'completed', minRecords: 1, maxDurationMs: 30000, minNodes: 1 },
    };
    const result = await runFixture(fixture);
    const failures = checkExpectations(fixture, result);
    assert.deepStrictEqual(failures, [], `fixture expectations failed: ${failures.join('; ')}`);
    assert.ok(result.totalRecords >= 1, 'expected at least one rate record');
  });
});
