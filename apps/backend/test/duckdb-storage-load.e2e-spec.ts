import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import {
  createTestApp,
  closeTestApp,
  setupConnectorDataMart,
  AUTH_HEADER,
  OPEN_HOLIDAYS_FIXTURE_ROWS,
} from '@owox/test-utils';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataMartRunStatus } from '../src/data-marts/enums/data-mart-run-status.enum';
import { escapeDuckDbIdentifier } from '../src/data-marts/data-storage-types/duckdb/utils/duckdb-identifier.utils';
import { createHardenedInstance } from '../src/data-marts/data-storage-types/duckdb/adapters/duckdb-api.adapter';

// Genuine end-to-end proof for SP-B1: a real connector load, driven through the
// same child-process runner production uses, landing real rows in an on-disk
// DuckDB file. Mirrors data-mart-runs.e2e-spec.ts's HTTP flow (setup -> manual-run
// -> poll), but additionally opens the resulting `.duckdb` file (READ_ONLY, with the
// backend's production options) and asserts the destination table holds exactly the
// OpenHolidays fixture's rows. A status-only assertion would not prove data landed, so
// this is the load-bearing check of the whole task.
//
// The connector run trigger is polled by a 5s cron (ConnectorRunTriggerHandlerService),
// so completion can take up to ~5s beyond the actual fetch+write time -- the poll
// loop and test timeout below are sized generously for that.

const TERMINAL_STATUSES: ReadonlySet<DataMartRunStatus> = new Set([
  DataMartRunStatus.SUCCESS,
  DataMartRunStatus.FAILED,
  DataMartRunStatus.CANCELLED,
  DataMartRunStatus.INTERRUPTED,
  DataMartRunStatus.RESTRICTED,
]);

interface RunSnapshot {
  id: string;
  status: DataMartRunStatus;
  logs: string[] | null;
  errors: string[] | null;
  [key: string]: unknown;
}

describe('DuckDB storage — connector load path (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let duckDataDir: string;

  beforeAll(async () => {
    // Must be set before createTestApp(): ConfigService/AppModule read env vars
    // at boot time (mirrors how createTestApp itself sets DB_TYPE/SQLITE_DB_PATH
    // before dynamically importing AppModule).
    duckDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'owox-duck-e2e-'));
    process.env.DUCKDB_DATA_DIR = duckDataDir;

    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
    fs.rmSync(duckDataDir, { recursive: true, force: true });
    delete process.env.DUCKDB_DATA_DIR;
  });

  it('runs a real connector load into a DuckDB storage file and lands rows on disk', async () => {
    const { storageId, dataMartId } = await setupConnectorDataMart(agent, app, {
      storageType: DataStorageType.DUCKDB,
      fullyQualifiedName: 'main.holidays',
    });

    const runRes = await agent
      .post(`/api/data-marts/${dataMartId}/manual-run`)
      .set(AUTH_HEADER)
      .send({});
    expect(runRes.status).toBe(201);
    const runId = runRes.body.runId as string;

    const finalRun = await pollRunUntilTerminal(agent, dataMartId, runId);

    if (finalRun.status !== DataMartRunStatus.SUCCESS) {
      throw new Error(
        `Expected DataMartRun ${runId} to reach SUCCESS, got ${finalRun.status}.\n` +
          `logs=${JSON.stringify(finalRun.logs)}\nerrors=${JSON.stringify(finalRun.errors)}`
      );
    }

    // --- The load-bearing assertion: open the REAL .duckdb file the spawned
    // connector-runner child process wrote to, and confirm rows actually landed. ---
    const dbPath = path.join(duckDataDir, `${storageId}.duckdb`);
    expect(fs.existsSync(dbPath)).toBe(true);

    const instance = await createHardenedInstance(dbPath, { access_mode: 'READ_ONLY' });
    const connection = await instance.connect();
    try {
      // DestinationSchemaName='main' (1st segment of fullyQualifiedName). The final
      // table name is 'holidays' (2nd segment) -- ConnectorStorageConfigService emits
      // DestinationTableNameOverride='publicHolidays holidays' ("<node> <table>"), and
      // the runtime's AbstractSource.getDestinationName() strips the node-name prefix
      // before AbstractConnector.getStorageForNode() writes the final per-node table
      // name into context. Confirmed against the real runtime by this e2e itself.
      const qualifiedTable = escapeDuckDbIdentifier('main.holidays');
      const reader = await connection.runAndReadAll(
        `SELECT id, date, name FROM ${qualifiedTable} ORDER BY id`
      );
      const rows = reader.getRowObjects() as Array<Record<string, unknown>>;

      expect(
        rows.map(row => ({ id: String(row.id), date: String(row.date), name: String(row.name) }))
      ).toEqual(OPEN_HOLIDAYS_FIXTURE_ROWS);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  }, 90_000);
});

/**
 * Polls `GET /api/data-marts/:id/runs/:runId` until the run reaches a terminal
 * status. The connector run trigger is processed by a 5s cron
 * (see ConnectorRunTriggerHandlerService.processingCronExpression), so this
 * budgets well beyond that plus real network fetch + child-process spawn time.
 */
async function pollRunUntilTerminal(
  agent: supertest.Agent,
  dataMartId: string,
  runId: string,
  timeoutMs = 75_000
): Promise<RunSnapshot> {
  const start = Date.now();
  let last: RunSnapshot | undefined;

  while (Date.now() - start < timeoutMs) {
    const res = await agent.get(`/api/data-marts/${dataMartId}/runs/${runId}`).set(AUTH_HEADER);
    expect(res.status).toBe(200);
    last = res.body as RunSnapshot;

    if (TERMINAL_STATUSES.has(last.status)) {
      return last;
    }

    await sleep(750);
  }

  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for run ${runId} to reach a terminal status ` +
      `(last status=${last?.status ?? 'unknown'}).`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
