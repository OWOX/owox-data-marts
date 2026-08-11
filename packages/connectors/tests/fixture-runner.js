// packages/connectors/tests/fixture-runner.js
//
// Fixture runner for connector integration tests. Replays real connector
// configs (definitionRun + credentials copied from staging) in-process with
// a mock in-memory storage. The connector code is loaded from the BUILT
// bundle (dist/index.cjs) so we exercise the same path as production.
//
// Real credentials in *.fixture.json are gitignored (see tests/.gitignore).

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load the bundled Core/Connectors so we run the same code as production.
const distPath = path.resolve(__dirname, '..', 'dist', 'index.cjs');
const requireCjs = createRequire(import.meta.url);
const owox = requireCjs(distPath);
const { Core, Connectors } = owox;

/**
 * Mock Storage - captures records in memory instead of writing to a real DB.
 *
 * Stand-alone class (does NOT extend AbstractStorage) so it doesn't enforce
 * the non-empty `uniqueKeyColumns` invariant that production storages have.
 */
class MockStorage {
  constructor(context, uniqueKeyColumns, schema, tableName) {
    this.context = context;
    this.uniqueKeyColumns = Array.isArray(uniqueKeyColumns)
      ? uniqueKeyColumns
      : uniqueKeyColumns
        ? [uniqueKeyColumns]
        : [];
    this.schema = schema;
    this.tableName = tableName;
    this.records = [];
    this.initCount = 0;
  }
  async init() {
    this.initCount++;
  }
  async saveData(records) {
    if (Array.isArray(records)) this.records.push(...records);
    else if (records) this.records.push(records);
  }
  // Stubs for Sources that may call these directly.
  async saveRecordsAddedToBuffer() {}
  async cleanUpExpiredData() {}
  getColumnType() {
    return 'STRING';
  }
}

/**
 * Build context input from a fixture, replicating the minimal portion of
 * backend ConnectorSourceConfigService / ConnectorExecutionService logic
 * needed for in-process replay.
 *
 * Backend convention: Fields config is "node field, node field, ..." which
 * AbstractSource._parseFieldsString parses on a comma-then-optional-whitespace
 * delimiter and a single-space node/field separator.
 */
function buildContextInput(fixture) {
  const dr = fixture.definitionRun?.connector;
  if (!dr?.source?.name) {
    throw new Error('Fixture is missing definitionRun.connector.source.name');
  }

  const source = dr.source;
  const node = source.node;
  const fields = Array.isArray(source.fields) ? source.fields : [];
  const fieldsCsv = fields.map(f => `${node} ${f}`).join(', ');

  const wrap = obj => {
    const wrapped = {};
    for (const [k, v] of Object.entries(obj || {})) {
      wrapped[k] = v && typeof v === 'object' && 'value' in v ? v : { value: v };
    }
    return wrapped;
  };

  const sourceConfig = wrap(fixture.sourceCredentials || {});
  if (fieldsCsv) sourceConfig.Fields = { value: fieldsCsv };
  if (fixture.runState?.lastRequestedDate) {
    sourceConfig.LastRequestedDate = { value: fixture.runState.lastRequestedDate };
  }

  const storageConfig = wrap(fixture.storageCredentials || {});

  return {
    source: { name: source.name, config: sourceConfig },
    storage: { name: fixture.storageType || 'MockStorage', config: storageConfig },
    runConfig: { type: 'INCREMENTAL', data: [], state: fixture.runState || {} },
    env: { datamartId: 'test-fixture-datamart', runId: `test-fixture-run-${Date.now()}` },
  };
}

/**
 * Resolve a Source class from the bundle.
 *
 * Bundle export shape (verified):
 *   owox.Connectors[sourceName][`${sourceName}Source`]
 *   owox[sourceName][`${sourceName}Source`]   (top-level alias)
 */
function resolveSourceClass(sourceName) {
  const fromConnectors = Connectors?.[sourceName]?.[`${sourceName}Source`];
  if (fromConnectors) return fromConnectors;
  const fromTop = owox[sourceName]?.[`${sourceName}Source`];
  if (fromTop) return fromTop;
  throw new Error(`Cannot resolve Source class "${sourceName}Source" from bundle`);
}

/**
 * Resolve a Source instance: a hand-written Source class, or — for a
 * manifest-only declarative connector — a DeclarativeSource built from the
 * bundled manifest.
 */
function resolveSource(sourceName, context) {
  const fromConnectors = Connectors?.[sourceName]?.[`${sourceName}Source`];
  const fromTop = owox[sourceName]?.[`${sourceName}Source`];
  const SourceClass = fromConnectors || fromTop;
  if (SourceClass) return new SourceClass(context);

  const manifest = Connectors?.[sourceName]?.manifest || owox[sourceName]?.manifest;
  if (manifest && manifest.nodes) {
    const model = new Core.ManifestParser().parse(JSON.stringify(manifest));
    return new Core.DeclarativeSource(context, model);
  }
  throw new Error(`Cannot resolve Source for "${sourceName}" (no class, no declarative manifest)`);
}

/**
 * Run a fixture and return capture results.
 * Does NOT write to stdout - captures events into an array.
 */
export async function runFixture(fixture) {
  if (fixture.skip) {
    return { skipped: true, reason: fixture.skipReason || 'skip flag' };
  }

  const input = buildContextInput(fixture);
  const context = new Core.AbstractContext(input);

  // Capture all emitted events instead of writing to stdout.
  const events = [];
  context.emit = event => {
    events.push(event.toJSON ? event.toJSON() : event);
  };

  // Track storage instances so we can sum records across nodes.
  const storageInstances = [];
  class TrackingStorage extends MockStorage {
    constructor(...args) {
      super(...args);
      storageInstances.push(this);
    }
  }

  const source = resolveSource(input.source.name, context);
  const connector = new Core.AbstractConnector(context, source, TrackingStorage);

  const startedAt = Date.now();
  let runError = null;
  try {
    await connector.run();
  } catch (e) {
    runError = e;
  }
  const durationMs = Date.now() - startedAt;

  const totalRecords = storageInstances.reduce((acc, s) => acc + s.records.length, 0);
  const stateEvents = events.filter(e => e.type === 'STATE');
  const lastState = stateEvents[stateEvents.length - 1]?.state;
  const controlEvents = events.filter(e => e.type === 'CONTROL');
  const finalControl = controlEvents[controlEvents.length - 1];
  const errorEvents = events.filter(e => e.type === 'LOG' && e.level === 'error');

  return {
    skipped: false,
    durationMs,
    totalRecords,
    storageCount: storageInstances.length,
    nodesProcessed: storageInstances.length,
    finalControlAction: finalControl?.action,
    finalControlError: finalControl?.error,
    lastState,
    events,
    errorLogs: errorEvents,
    runError: runError ? { message: runError.message, stack: runError.stack } : null,
    storageRecords: Object.fromEntries(storageInstances.map(s => [s.tableName, s.records.length])),
  };
}

/**
 * Load a fixture from a JSON path.
 */
export async function loadFixture(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Discover all .fixture.json files in tests/fixtures/.
 */
export async function discoverFixtures() {
  const fixturesDir = path.resolve(__dirname, 'fixtures');
  let entries;
  try {
    entries = await fs.readdir(fixturesDir);
  } catch {
    return [];
  }
  return entries
    .filter(name => name.endsWith('.fixture.json'))
    .map(name => path.join(fixturesDir, name));
}

/**
 * Apply expected assertions. Returns array of assertion failures
 * (empty if all passed).
 */
export function checkExpectations(fixture, result) {
  const failures = [];
  const exp = fixture.expected || {};

  if (exp.controlAction && result.finalControlAction !== exp.controlAction) {
    failures.push(
      `expected controlAction=${exp.controlAction} got ${result.finalControlAction}` +
        (result.finalControlError ? ` (error: ${result.finalControlError})` : '')
    );
  }
  if (typeof exp.minRecords === 'number' && result.totalRecords < exp.minRecords) {
    failures.push(`expected minRecords>=${exp.minRecords} got ${result.totalRecords}`);
  }
  if (typeof exp.maxDurationMs === 'number' && result.durationMs > exp.maxDurationMs) {
    failures.push(`expected maxDurationMs<=${exp.maxDurationMs} got ${result.durationMs}`);
  }
  if (typeof exp.minNodes === 'number' && result.nodesProcessed < exp.minNodes) {
    failures.push(`expected minNodes>=${exp.minNodes} got ${result.nodesProcessed}`);
  }
  if (exp.lastStateValue && result.lastState?.lastRequestedDate !== exp.lastStateValue) {
    failures.push(
      `expected lastState.lastRequestedDate=${exp.lastStateValue} got ${result.lastState?.lastRequestedDate}`
    );
  }
  if (result.runError && exp.controlAction === 'completed') {
    failures.push(`unexpected exception: ${result.runError.message}`);
  }

  return failures;
}
