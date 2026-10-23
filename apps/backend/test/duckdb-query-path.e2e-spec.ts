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
import { DataMartService } from '../src/data-marts/services/data-mart.service';
import { DataQualityCheckCompiler } from '../src/data-marts/data-quality/data-quality-check-compiler';
import { DataQualityQueryExecutorService } from '../src/data-marts/data-quality/data-quality-query-executor.service';
import {
  DataQualityQueryExecution,
  DataQualityResultParser,
} from '../src/data-marts/data-quality/data-quality-result-parser';
import { buildDataQualityRuleKey } from '../src/data-marts/dto/schemas/data-quality/data-quality-config.schema';
import { DataQualityCategory } from '../src/data-marts/enums/data-quality-category.enum';
import { DataQualityCheckStatus } from '../src/data-marts/enums/data-quality-check-status.enum';
import { DataQualityScope } from '../src/data-marts/enums/data-quality-scope.enum';
import { DataQualitySeverity } from '../src/data-marts/enums/data-quality-severity.enum';
import {
  QueryDataMartService,
  QueryDataMartCommand,
} from '../src/data-marts/use-cases/query-data-mart.service';

// Genuine end-to-end proof for SP-B2's query path: chains onto
// duckdb-storage-load.e2e-spec.ts (SP-B1) by reusing its exact setup (temp
// DUCKDB_DATA_DIR, setupConnectorDataMart + manual-run + poll), then goes one step
// further and proves the LOADED data is actually queryable through the product:
//
//   real connector load -> actualize schema (Task 5 facade -> DuckDbDataMartSchemaProvider)
//   -> QueryDataMartService.run() (the `query_data_mart` MCP tool backend; Task 4 query
//      builder + Task 3 clause renderer + Task 6 streaming report reader)
//
// The load-bearing assertions: the `.duckdb` file the connector wrote to, re-opened
// READ_ONLY with the backend's production options, holds exactly the OpenHolidays
// fixture's rows, and query_data_mart returns exactly those rows.
//
// The connector run trigger is polled by a 5s cron (ConnectorRunTriggerHandlerService),
// so completion can take up to ~5s beyond the actual fetch+write time -- the poll loop and
// test timeout below are sized generously for that.

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

// NullIdpProvider (used by createTestApp) authenticates `test-token` as userId '0',
// projectId '0', roles ['admin']. AccessDecisionService uses the admin shortcut and
// allows SEE on any data mart -- no ownership/context row needed (mirrors
// query-data-mart-real.integration.ts).
const NULL_IDP_PROJECT_ID = '0';
const NULL_IDP_USER_ID = '0';
const NULL_IDP_ROLES = ['admin'];

describe('DuckDB storage — query path (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let duckDataDir: string;
  let dataMartService: DataMartService;
  let queryDataMartService: QueryDataMartService;

  beforeAll(async () => {
    // Must be set before createTestApp(): ConfigService/AppModule read env vars
    // at boot time (mirrors duckdb-storage-load.e2e-spec.ts).
    duckDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'owox-duck-query-e2e-'));
    process.env.DUCKDB_DATA_DIR = duckDataDir;

    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    dataMartService = app.get(DataMartService);
    queryDataMartService = app.get(QueryDataMartService);
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
    fs.rmSync(duckDataDir, { recursive: true, force: true });
    delete process.env.DUCKDB_DATA_DIR;
  });

  it('loads real rows via a connector run, actualizes the schema, and query_data_mart reads them back', async () => {
    const { storageId, dataMartId } = await setupConnectorDataMart(agent, app, {
      storageType: DataStorageType.DUCKDB,
      fullyQualifiedName: 'main.holidays',
    });

    // --- Load: same real connector run + poll as SP-B1's load e2e. ---
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

    // --- Oracle: open the REAL .duckdb file the spawned connector-runner child process
    // wrote to directly (READ_ONLY, with the backend's production options), independent of
    // the product's own read path. ---
    const dbPath = path.join(duckDataDir, `${storageId}.duckdb`);
    expect(fs.existsSync(dbPath)).toBe(true);

    const instance = await createHardenedInstance(dbPath, { access_mode: 'READ_ONLY' });
    const connection = await instance.connect();
    try {
      const qualifiedTable = escapeDuckDbIdentifier('main.holidays');
      const rawReader = await connection.runAndReadAll(
        `SELECT id, date, name FROM ${qualifiedTable}`
      );
      const rawRows = rawReader.getRowObjects() as Array<Record<string, unknown>>;

      // The load-bearing precondition for this whole test: the fixture's rows are on disk.
      expect(
        rawRows
          .map(row => ({ id: String(row.id), date: String(row.date), name: String(row.name) }))
          .sort((a, b) => a.id.localeCompare(b.id))
      ).toEqual(OPEN_HOLIDAYS_FIXTURE_ROWS);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }

    // --- Actualize: routes through the Task-5 facade -> DuckDbDataMartSchemaProvider,
    // introspecting the just-loaded table and persisting a duckdb-data-mart-schema onto
    // the entity. QueryDataMartService.run() below reloads the entity from the DB, so the
    // schema must be persisted first (mirrors query-data-mart-real.integration.ts). ---
    const dataMart = await dataMartService.getByIdAndProjectId(dataMartId, NULL_IDP_PROJECT_ID);
    await dataMartService.actualizeSchemaInEntity(dataMart);
    await dataMartService.save(dataMart);

    // --- The primary required proof: drive the `query_data_mart` path for real. ---
    const result = await queryDataMartService.run(
      new QueryDataMartCommand({
        projectId: NULL_IDP_PROJECT_ID,
        userId: NULL_IDP_USER_ID,
        roles: NULL_IDP_ROLES,
        dataMartId,
        fields: ['id', 'date', 'name'],
        limit: 100,
      })
    );

    expect(result.columns).toEqual(['id', 'date', 'name']);
    expect(result.truncated).toBe(false);
    expect(
      result.rows
        .map(([id, date, name]) => ({ id: String(id), date: String(date), name: String(name) }))
        .sort((a, b) => a.id.localeCompare(b.id))
    ).toEqual(OPEN_HOLIDAYS_FIXTURE_ROWS);

    // --- Data quality: a not-null check on the loaded key column runs against the file. ---
    const scope = { type: DataQualityScope.FIELD as const, fieldPath: ['id'] };
    const check = await app.get(DataQualityCheckCompiler).compile({
      storageType: DataStorageType.DUCKDB,
      sourceQuery: `SELECT * FROM ${escapeDuckDbIdentifier('main.holidays')}`,
      schema: dataMart.schema ?? null,
      rule: {
        key: buildDataQualityRuleKey(DataQualityCategory.NULL_RATE, scope),
        category: DataQualityCategory.NULL_RATE,
        scope,
        severity: DataQualitySeverity.WARNING,
        enabled: true,
        isApplicable: true,
        parameters: { thresholdPercent: 0 },
      },
    });
    expect(check.kind).toBe('EXECUTABLE');

    const executions: Array<DataQualityQueryExecution | null> = [];
    for await (const result of app
      .get(DataQualityQueryExecutorService)
      .executeChecks(dataMart, [check])) {
      executions.push(result.execution);
    }
    expect(executions).toHaveLength(1);
    expect(executions[0]?.error).toBeUndefined();

    const parsed = await app
      .get(DataQualityResultParser)
      .parse(DataStorageType.DUCKDB, check, executions[0]);
    expect(parsed.status).toBe(DataQualityCheckStatus.PASSED);
  }, 120_000);
});

/**
 * Polls `GET /api/data-marts/:id/runs/:runId` until the run reaches a terminal
 * status. The connector run trigger is processed by a 5s cron
 * (see ConnectorRunTriggerHandlerService.processingCronExpression), so this
 * budgets well beyond that plus real network fetch + child-process spawn time.
 *
 * Copied verbatim from duckdb-storage-load.e2e-spec.ts (SP-B1) -- not shared/exported
 * between e2e-spec files, so each file owns its own copy.
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
