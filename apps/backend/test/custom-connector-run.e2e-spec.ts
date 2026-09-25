import { INestApplication } from '@nestjs/common';
import { createServer, Server } from 'http';
import type { AddressInfo } from 'net';
import * as supertest from 'supertest';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

import { createTestApp, closeTestApp, AUTH_HEADER, StorageBuilder } from '@owox/test-utils';
import { Core } from '@owox/connectors';

import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { ConnectorProcessSpawnerService } from '../src/data-marts/services/connector/connector-process-spawner.service';
import type { GracefulShutdownService } from '../src/common/scheduler/services/graceful-shutdown.service';

/**
 * A published CUSTOM connector, driven end to end until rows come out.
 *
 * WHAT THIS PROVES
 * ----------------
 * One unbroken chain, all of it production code:
 *   POST /connectors/custom  -> manifest stored in connector_definition_version
 *   POST .../publish         -> version marked PUBLISHED
 *   PUT  /data-marts/:id/definition -> Data Mart bound to the connector BY NAME
 *   PUT  /data-marts/:id/publish
 *   POST /data-marts/:id/manual-run -> DataMartRun + ConnectorRunTrigger
 *   [scheduler] -> ConnectorExecutorService
 *                -> ConnectorDefinitionService.tryResolveManifest()  (the STORED manifest,
 *                   published version only -- not the one this file typed into the request)
 *                -> ConfigDto / RunConfigDto
 *                -> ConnectorProcessSpawnerService.spawnConnector()
 *                -> a REAL `node` child running the REAL @owox/connectors runner
 *                -> Core.ManifestParser -> Core.DeclarativeSource -> Core.AbstractConnector
 *                -> real HTTP against a real (local) upstream
 *                -> AbstractConnector._writeBatch -> storage.saveData(rows)
 *
 * and then asserts the CONJUNCTION that the four "run reports COMPLETED having written
 * nothing" regressions all slipped through: **non-zero rows AND status SUCCESS**. Each of
 * those bugs passed the status half. Asserting only the status is what let them ship, so
 * neither half is asserted here without the other.
 *
 * WHAT THIS DOES NOT PROVE
 * ------------------------
 * Rows do NOT land in a warehouse. Every storage this branch has (BigQuery, Athena,
 * Redshift, Snowflake, Databricks) is an external cloud service written to from inside the
 * child process, so no backend e2e can read a table back. Two seams are therefore
 * substituted, and nothing else is:
 *
 *   1. The storage class. `OW_TEST=1` makes the runner resolve `Core.TestStorage` instead
 *      of `<Type>Storage` (connector-runner.js). TestStorage is the engine's own in-tree
 *      double: it satisfies the same `init()` / `saveData(data)` contract and is called
 *      from the same `AbstractConnector._writeBatch`, and prints each saved row to stdout.
 *      So the rows counted below are exactly the rows the production code path handed to a
 *      storage -- but the concrete `saveData` of the five cloud adapters, their schema
 *      handling and their MERGE/replace semantics are NOT exercised. `OW_TEST=1` also
 *      turns on `emitSample` and the slice cap in DeclarativeSource's options; neither
 *      affects the row count for the single non-time-series node used here.
 *   2. The upstream. The manifest points at a local http server instead of a vendor API,
 *      which the production spawner permits only because it forwards OW_ALLOW_LOCAL_EGRESS
 *      to the child (SsrfGuard honours it outside NODE_ENV=production). The engine's HTTP
 *      client and recordSelector are the real thing; the manifest declares no pagination,
 *      no authentication and no accounts, so none of those paths are exercised here.
 *
 * The full "rows land in a real store" proof needs a storage the test process can read
 * back, which on this branch does not exist; it lives on feat/duckdb-storage and above it
 * feat/connector-conformance-lab (conformance-product-path.e2e-spec.ts).
 */

/** Rows the upstream serves. Distinct values so a wrong node/recordPath cannot look right. */
const UPSTREAM_ROWS = [
  { id: 'row-1', name: 'alpha' },
  { id: 'row-2', name: 'beta' },
  { id: 'row-3', name: 'gamma' },
];

const TEST_ROW_MARKER: string = Core.TEST_ROW_MARKER;

type ConfigDto = InstanceType<typeof Core.ConfigDto>;
type RunConfigDto = InstanceType<typeof Core.RunConfigDto>;

type SpawnStdio = {
  logCapture?: { onStdout?: (message: string) => void; onStderr?: (message: string) => void };
  onSpawn?: (pid: number | undefined) => void;
};

/**
 * The production spawner, with the two substitutions documented above and nothing else.
 * `spawnConnector` is NOT reimplemented: the real one still resolves
 * `@owox/connectors/runner`, spawns it detached, frames stdout, and maps the exit code --
 * this only appends two env vars to the env the real `buildChildEnv` produced, and taps
 * the stdout callback on the way past so the rows can be counted per run.
 */
class RowCapturingSpawner extends ConnectorProcessSpawnerService {
  /** Rows handed to `storage.saveData()`, keyed by run id. */
  readonly rowsByRun = new Map<string, Record<string, unknown>[]>();

  protected buildChildEnv(
    datamartId: string,
    runId: string,
    configuration: ConfigDto,
    runConfig: RunConfigDto,
    manifest?: Record<string, unknown> | null
  ): Record<string, string | undefined> {
    return {
      ...super.buildChildEnv(datamartId, runId, configuration, runConfig, manifest),
      // Swap only the storage class; see "WHAT THIS DOES NOT PROVE" above.
      OW_TEST: '1',
      // Production already forwards this name when it is set on the backend; setting it
      // here rather than on process.env keeps the relaxation scoped to this suite.
      OW_ALLOW_LOCAL_EGRESS: '1',
    };
  }

  spawnConnector(
    datamartId: string,
    runId: string,
    configuration: ConfigDto,
    runConfig: RunConfigDto,
    stdio: SpawnStdio,
    signal?: AbortSignal,
    manifest?: Record<string, unknown> | null
  ): Promise<void> {
    const rows: Record<string, unknown>[] = this.rowsByRun.get(runId) ?? [];
    this.rowsByRun.set(runId, rows);

    const downstream = stdio?.logCapture?.onStdout;
    const tapped: SpawnStdio = {
      ...stdio,
      logCapture: {
        ...stdio?.logCapture,
        onStdout: (message: string) => {
          if (message.startsWith(TEST_ROW_MARKER)) {
            try {
              rows.push(JSON.parse(message.slice(TEST_ROW_MARKER.length)));
            } catch {
              // A malformed row line is a failure of the engine, not of the tap; leave it
              // to the assertions (which will see a short count) rather than throwing here.
            }
          }
          downstream?.(message);
        },
      },
    };

    return super.spawnConnector(
      datamartId,
      runId,
      configuration,
      runConfig,
      tapped,
      signal,
      manifest
    );
  }
}

const spawner = new RowCapturingSpawner({
  isInShutdownMode: () => false,
} as unknown as GracefulShutdownService);

const TERMINAL_STATUSES = ['SUCCESS', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'RESTRICTED'];

describe('Custom Connector run (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let upstream: Server;
  let upstreamUrl: string;
  let upstreamHits = 0;

  beforeAll(async () => {
    upstream = createServer((req, res) => {
      if ((req.url ?? '').startsWith('/items')) {
        upstreamHits += 1;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: UPSTREAM_ROWS }));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `unexpected path ${req.url}` }));
    });
    await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve));
    upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

    const testApp = await createTestApp([
      { provide: ConnectorProcessSpawnerService, useValue: spawner },
    ]);
    app = testApp.app;
    agent = testApp.agent;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
    await new Promise<void>(resolve => upstream.close(() => resolve()));
  });

  const manifestFor = (connectorName: string) => ({
    version: '1.0',
    name: connectorName,
    baseUrl: upstreamUrl,
    parameters: {},
    nodes: {
      items: {
        destinationName: 'items',
        isTimeSeries: false,
        uniqueKeys: ['id'],
        fields: { id: { type: 'string' }, name: { type: 'string' } },
        request: { method: 'GET', path: '/items' },
        recordSelector: { recordPath: ['data'] },
      },
    },
  });

  /**
   * Storage row plus the config/credential the run needs. Written straight to the database
   * because PUT /data-storages validates against live cloud services; identical to what
   * `setupConnectorDataMart` in @owox/test-utils does for bundled connectors.
   */
  const createStorage = async (): Promise<string> => {
    const storageRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send(new StorageBuilder().withType(DataStorageType.GOOGLE_BIGQUERY).build());
    expect(storageRes.status).toBe(201);

    const dataSource = app.get(DataSource);
    const credentialId = randomUUID();
    await dataSource.query(
      `INSERT INTO data_storage_credentials (id, projectId, type, credentials, createdAt, modifiedAt)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [credentialId, '0', 'google_service_account', JSON.stringify({ type: 'test-credentials' })]
    );
    await dataSource.query(`UPDATE data_storage SET config = ?, credentialId = ? WHERE id = ?`, [
      JSON.stringify({ projectId: 'test-project', dataset: 'test_dataset' }),
      credentialId,
      storageRes.body.id,
    ]);
    return storageRes.body.id as string;
  };

  const waitForTerminalRun = async (
    dataMartId: string,
    runId: string,
    timeoutMs = 90_000
  ): Promise<Record<string, unknown>> => {
    const deadline = Date.now() + timeoutMs;
    let last: Record<string, unknown> = {};
    while (Date.now() < deadline) {
      const res = await agent.get(`/api/data-marts/${dataMartId}/runs/${runId}`).set(AUTH_HEADER);
      expect(res.status).toBe(200);
      last = res.body as Record<string, unknown>;
      if (TERMINAL_STATUSES.includes(String(last.status))) {
        return last;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(
      `Run ${runId} never reached a terminal status within ${timeoutMs}ms; last seen: ` +
        JSON.stringify(last)
    );
  };

  /**
   * Publishing a Data Mart fires its own run (PublishDataMartService, fire-and-forget).
   * Let it finish rather than cancelling it, so it can neither race the manual run for a
   * slot nor leave a child process behind. Waits for it to appear first -- "no runs yet"
   * a moment after publish means it has not been created, not that there is none.
   */
  const settlePublishRun = async (dataMartId: string): Promise<void> => {
    const listRuns = async (): Promise<Array<{ id: string; status: string }>> => {
      const res = await agent.get(`/api/data-marts/${dataMartId}/runs`).set(AUTH_HEADER);
      return (res.body?.runs ?? []) as Array<{ id: string; status: string }>;
    };

    const appearBy = Date.now() + 10_000;
    while (Date.now() < appearBy && (await listRuns()).length === 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Then drain: a run seen as PENDING can still be joined by a late sibling, and the
    // manual run below is refused outright while anything is still active.
    const drainBy = Date.now() + 90_000;
    while (Date.now() < drainBy) {
      const active = (await listRuns()).filter(run => !TERMINAL_STATUSES.includes(run.status));
      if (active.length === 0) {
        return;
      }
      await waitForTerminalRun(dataMartId, active[0].id);
    }
    throw new Error(`Publish-triggered runs for ${dataMartId} never settled`);
  };

  it('runs a published custom connector: non-zero rows reach storage.saveData AND the run succeeds', async () => {
    const connectorName = `RunToRowsApi${Date.now()}`;

    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({
        name: connectorName,
        title: 'Run To Rows API',
        manifest: manifestFor(connectorName),
      });
    expect(created.status).toBe(201);

    const published = await agent
      .post(`/api/connectors/custom/${created.body.id}/publish`)
      .set(AUTH_HEADER);
    expect(published.status).toBe(201);

    const storageId = await createStorage();
    const martRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: `Run To Rows ${Date.now()}`, storageId });
    expect(martRes.status).toBe(201);
    const dataMartId = martRes.body.id as string;

    const definitionRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'CONNECTOR',
        definition: {
          connector: {
            source: {
              name: connectorName,
              configuration: [{}],
              node: 'items',
              fields: ['id', 'name'],
            },
            storage: { fullyQualifiedName: 'test_dataset.items' },
          },
        },
      });
    expect(definitionRes.status).toBe(200);

    const publishMart = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER);
    expect(publishMart.status).toBe(200);
    await settlePublishRun(dataMartId);

    const hitsBeforeRun = upstreamHits;
    const manualRun = await agent
      .post(`/api/data-marts/${dataMartId}/manual-run`)
      .set(AUTH_HEADER)
      .send({});
    expect(manualRun.status).toBe(201);
    const runId = manualRun.body.runId as string;

    const finished = await waitForTerminalRun(dataMartId, runId);
    const capturedRows = spawner.rowsByRun.get(runId) ?? [];

    // BOTH halves, together. Either one alone is a test the regressions this guards
    // against would have passed.
    expect(capturedRows).toHaveLength(UPSTREAM_ROWS.length);
    expect(finished.status).toBe('SUCCESS');

    // The rows are the upstream's, carried through recordSelector and field selection --
    // not an echo of anything this test handed the backend.
    expect(capturedRows.map(row => row.id).sort()).toEqual(['row-1', 'row-2', 'row-3']);
    expect(capturedRows.map(row => row.name).sort()).toEqual(['alpha', 'beta', 'gamma']);

    // And the engine really went out over HTTP for them.
    expect(upstreamHits).toBeGreaterThan(hitsBeforeRun);
  }, 180_000);

  /**
   * The manifest the run uses is the STORED, PUBLISHED one, so a draft edit made after
   * publication must not reach the runner. Without this, "the backend resolves the stored
   * manifest" is only asserted by the happy path, where the stored manifest and the last
   * thing written happen to be identical.
   */
  it('runs the published manifest, not a newer draft', async () => {
    const connectorName = `DraftIgnoredApi${Date.now()}`;

    const created = await agent
      .post('/api/connectors/custom')
      .set(AUTH_HEADER)
      .send({
        name: connectorName,
        title: 'Draft Ignored API',
        manifest: manifestFor(connectorName),
      });
    expect(created.status).toBe(201);
    const published = await agent
      .post(`/api/connectors/custom/${created.body.id}/publish`)
      .set(AUTH_HEADER);
    expect(published.status).toBe(201);

    // A draft that would 404 against the upstream if it were ever the one that ran.
    const draft = manifestFor(connectorName);
    draft.nodes.items.request.path = '/definitely-not-items';
    const draftRes = await agent
      .put(`/api/connectors/custom/${created.body.id}/draft`)
      .set(AUTH_HEADER)
      .send({ manifest: draft });
    expect(draftRes.status).toBe(200);

    const storageId = await createStorage();
    const martRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: `Draft Ignored ${Date.now()}`, storageId });
    expect(martRes.status).toBe(201);
    const dataMartId = martRes.body.id as string;

    expect(
      (
        await agent
          .put(`/api/data-marts/${dataMartId}/definition`)
          .set(AUTH_HEADER)
          .send({
            definitionType: 'CONNECTOR',
            definition: {
              connector: {
                source: {
                  name: connectorName,
                  configuration: [{}],
                  node: 'items',
                  fields: ['id', 'name'],
                },
                storage: { fullyQualifiedName: 'test_dataset.items' },
              },
            },
          })
      ).status
    ).toBe(200);

    expect((await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER)).status).toBe(
      200
    );
    await settlePublishRun(dataMartId);

    const manualRun = await agent
      .post(`/api/data-marts/${dataMartId}/manual-run`)
      .set(AUTH_HEADER)
      .send({});
    expect(manualRun.status).toBe(201);
    const runId = manualRun.body.runId as string;

    const finished = await waitForTerminalRun(dataMartId, runId);

    expect(spawner.rowsByRun.get(runId) ?? []).toHaveLength(UPSTREAM_ROWS.length);
    expect(finished.status).toBe('SUCCESS');
  }, 180_000);
});
