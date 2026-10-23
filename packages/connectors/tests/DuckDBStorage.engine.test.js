// packages/connectors/tests/DuckDBStorage.engine.test.js
//
// Task 4 (SP-A): proves the engine composes end-to-end — a real declarative
// connector run over `localhost` (offset pagination, 2 pages) landing into a
// real DuckDB file via `DuckDBStorage`, with `OW_ALLOW_LOCAL_EGRESS=1` as the
// only egress relaxation. Runs against the BUILT bundle (dist/index.cjs), the
// same artifact `connector-runner.js` requires in production.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { withBuildLock, buildBundle } from './buildBundleOnce.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');

let OWOX, duckdb, server, baseUrl;

before(async () => {
  // See buildBundleOnce.js: a cross-process lock spans build+require so this
  // file's rebuild can never overlap (and lose dist/index.cjs to) a sibling
  // test file's own `npm run build`.
  withBuildLock(() => {
    buildBundle(pkgRoot);
    OWOX = require(path.join(pkgRoot, 'dist', 'index.cjs'));
    duckdb = require('@duckdb/node-api');
  });
  // Offset pagination: /rows?offset=0&limit=2 → 3 total rows across 2 pages.
  const ALL = [
    { id: 1, name: 'a' },
    { id: 2, name: 'b' },
    { id: 3, name: 'c' },
  ];
  server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const offset = Number(u.searchParams.get('offset') || 0);
    const limit = Number(u.searchParams.get('limit') || 2);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ items: ALL.slice(offset, offset + limit) }));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(() => server && server.close());

test('declarative connector loads into DuckDB via localhost with egress flag', async () => {
  process.env.OW_ALLOW_LOCAL_EGRESS = '1';
  const dbPath = path.join(os.tmpdir(), `duck-eng-${process.pid}-${Date.now()}.duckdb`);
  try {
    const { Core, Storages } = OWOX;
    const manifest = {
      version: '1.0',
      name: 'MockConn',
      baseUrl,
      parameters: {},
      nodes: {
        rows: {
          uniqueKeys: ['id'],
          fields: {
            id: { apiName: 'id', type: 'integer' },
            name: { apiName: 'name', type: 'string' },
          },
          request: { method: 'GET', path: '/rows' },
          recordSelector: { recordPath: ['items'] },
          pagination: { type: 'offset', pageSize: 2, inject: { name: 'offset', into: 'query' } },
        },
      },
    };
    const context = new Core.AbstractContext({
      source: { name: 'MockConn', config: {} },
      storage: {
        name: 'DuckDB',
        config: {
          DatabasePath: { value: dbPath },
          DestinationSchemaName: { value: 'main' },
          DestinationTableName: { value: 'rows' },
          MaxBufferSize: { value: 2 },
          Fields: { value: 'rows id, rows name' },
        },
      },
      runConfig: null,
      env: { datamartId: 'dm', runId: 'run' },
    });

    // Resolve a DeclarativeSource from the inline manifest — the SAME path
    // connector-runner.js uses for a custom (OW_MANIFEST) manifest:
    //   const model = new Core.ManifestParser().parse(JSON.stringify(customManifest));
    //   source = new Core.DeclarativeSource(context, model, sourceOptions);
    // `ManifestParser` is a class whose `parse(json)` is an INSTANCE method that
    // takes a JSON STRING (not a static call taking a plain object) — confirmed
    // against src/connector-runner.js and src/Core/Declarative/ManifestParser.js.
    const model = new Core.ManifestParser().parse(JSON.stringify(manifest));
    const source = new Core.DeclarativeSource(context, model);
    const connector = new Core.AbstractConnector(context, source, Storages.DuckDB.DuckDBStorage);
    await connector.run();

    const instance = await duckdb.DuckDBInstance.create(dbPath);
    const connection = await instance.connect();
    const reader = await connection.runAndReadAll('SELECT id, name FROM "main"."rows" ORDER BY id');
    const rows = reader.getRowObjects();
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map(r => Number(r.id)),
      [1, 2, 3]
    );
    assert.deepEqual(
      rows.map(r => String(r.name)),
      ['a', 'b', 'c']
    );
  } finally {
    delete process.env.OW_ALLOW_LOCAL_EGRESS;
    fs.rmSync(dbPath, { force: true });
  }
});
