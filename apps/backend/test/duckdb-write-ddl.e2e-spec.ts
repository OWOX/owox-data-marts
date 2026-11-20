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
  DataMartBuilder,
  setDataMartSchema,
  OPEN_HOLIDAYS_FIXTURE_ROWS,
} from '@owox/test-utils';
import { DataStorageType } from '../src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataMartRunStatus } from '../src/data-marts/enums/data-mart-run-status.enum';
import { escapeDuckDbIdentifier } from '../src/data-marts/data-storage-types/duckdb/utils/duckdb-identifier.utils';
import { createHardenedInstance } from '../src/data-marts/data-storage-types/duckdb/adapters/duckdb-api.adapter';
import { DataMartService } from '../src/data-marts/services/data-mart.service';
import { DataMartTableReferenceService } from '../src/data-marts/services/data-mart-table-reference.service';
import { SqlRunService } from '../src/data-marts/use-cases/sql-run.service';
import { SqlRunCommand } from '../src/data-marts/dto/domain/sql-run.command';
import {
  QueryDataMartService,
  QueryDataMartCommand,
} from '../src/data-marts/use-cases/query-data-mart.service';

// Task 6 (SP-B2b) end-to-end proof: the whole DuckDB write/DDL surface built by Tasks 1-5
// composes through the REAL product services, chained onto a REAL connector load (reusing
// duckdb-storage-load.e2e-spec.ts / duckdb-query-path.e2e-spec.ts's exact setup: temp
// DUCKDB_DATA_DIR, setupConnectorDataMart + manual-run + poll):
//
//   real connector load (main.holidays)
//     -> a SECOND, SQL-definition data mart on the SAME storage/.duckdb file (the storage
//        <-> file mapping is 1:1 by storageId, not by data mart), whose SQL selects from
//        that loaded table
//     -> DataMartTableReferenceService.ensureSqlViewIsUpToDate -> CreateViewService
//        -> CreateViewExecutorFacade -> DuckDbCreateViewExecutor (Task 1: transient
//        READ_WRITE open, lock-retried inside DuckDbApiAdapter.conn()) creates a real
//        DuckDB VIEW
//     -> QueryDataMartService.run() reads the SQL mart back THROUGH that view (Task 4/5
//        query builder + Task 3 clause renderer)
//     -> SqlRunService.runBatches() (Task 2) streams the mart's own SQL directly, batched
//     -> a second QueryDataMartService.run() with a dateTrunc + non-UTC timeZone proves the
//        Task 4 `AT TIME ZONE` bucketing shifts real values out of UTC.
//
// Every leg is oracle-checked against a raw READ_ONLY reopen of the same `.duckdb` file
// (with the backend's production options, independent of the product's own read path --
// the same technique duckdb-storage-load/duckdb-query-path use), keyed by the connector's
// own unique key (`id`), never "a property exists". The loaded rows are exactly the
// OpenHolidays fixture's.

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
// allows SEE/EDIT on any data mart -- no ownership/context row needed (mirrors
// duckdb-query-path.e2e-spec.ts).
const NULL_IDP_PROJECT_ID = '0';
const NULL_IDP_USER_ID = '0';
const NULL_IDP_ROLES = ['admin'];

// A midnight-UTC instant shifted into America/New_York (UTC-4/-5, DST-independent -- always
// BEHIND UTC) always falls into the previous calendar day. This holds for every OpenHolidays
// date, whatever it happens to be on the day this test runs, so the timezone leg needs no
// hardcoded date fixture.
const NON_UTC_ZONE = 'America/New_York';

describe('DuckDB storage — write/DDL surface (e2e)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let duckDataDir: string;
  let dataMartService: DataMartService;
  let dataMartTableReferenceService: DataMartTableReferenceService;
  let sqlRunService: SqlRunService;
  let queryDataMartService: QueryDataMartService;

  beforeAll(async () => {
    // Must be set before createTestApp(): ConfigService/AppModule read env vars
    // at boot time (mirrors duckdb-storage-load.e2e-spec.ts / duckdb-query-path.e2e-spec.ts).
    duckDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'owox-duck-write-ddl-e2e-'));
    process.env.DUCKDB_DATA_DIR = duckDataDir;

    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    dataMartService = app.get(DataMartService);
    dataMartTableReferenceService = app.get(DataMartTableReferenceService);
    sqlRunService = app.get(SqlRunService);
    queryDataMartService = app.get(QueryDataMartService);
  }, 120_000);

  afterAll(async () => {
    await closeTestApp(app);
    fs.rmSync(duckDataDir, { recursive: true, force: true });
    delete process.env.DUCKDB_DATA_DIR;
  });

  it('creates a SQL-mart view via transient WRITE, reads through it, streams sql-run batches, and buckets a non-UTC timezone', async () => {
    // --- Load: identical real connector run + poll as duckdb-storage-load /
    // duckdb-query-path e2e (SP-B1/SP-B2). ---
    const { storageId, dataMartId: connectorDataMartId } = await setupConnectorDataMart(
      agent,
      app,
      {
        storageType: DataStorageType.DUCKDB,
        fullyQualifiedName: 'main.holidays',
      }
    );

    const runRes = await agent
      .post(`/api/data-marts/${connectorDataMartId}/manual-run`)
      .set(AUTH_HEADER)
      .send({});
    expect(runRes.status).toBe(201);
    const runId = runRes.body.runId as string;

    const finalRun = await pollRunUntilTerminal(agent, connectorDataMartId, runId);
    if (finalRun.status !== DataMartRunStatus.SUCCESS) {
      throw new Error(
        `Expected DataMartRun ${runId} to reach SUCCESS, got ${finalRun.status}.\n` +
          `logs=${JSON.stringify(finalRun.logs)}\nerrors=${JSON.stringify(finalRun.errors)}`
      );
    }

    const dbPath = path.join(duckDataDir, `${storageId}.duckdb`);
    expect(fs.existsSync(dbPath)).toBe(true);

    // --- Oracle #1: raw connector-loaded rows, independent of the product's read path. ---
    const holidaysOracle = await readHolidaysOracle(dbPath);
    // Load-bearing precondition for the whole test: the fixture's rows are on disk before the
    // create-view/query/sql-run/timezone legs below can prove anything about reading them.
    expect(holidaysOracle).toEqual(
      new Map(OPEN_HOLIDAYS_FIXTURE_ROWS.map(({ id, date, name }) => [id, { date, name }]))
    );

    // --- Set up the SQL-based DuckDB data mart, on the SAME storage/.duckdb file the
    // connector just loaded -- its SQL selects from the just-loaded table, casting the
    // connector's plain DATE column to TIMESTAMP so the timezone leg below has a
    // bucket-able column. ---
    const sqlMartRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send(
        new DataMartBuilder()
          .withStorageId(storageId)
          .withTitle('DuckDB SQL view mart (Task 6 e2e)')
          .build()
      );
    expect(sqlMartRes.status).toBe(201);
    const sqlMartId = sqlMartRes.body.id as string;

    const sqlQuery = 'SELECT id, CAST(date AS TIMESTAMP) AS event_ts, name FROM main.holidays';

    const defRes = await agent
      .put(`/api/data-marts/${sqlMartId}/definition`)
      .set(AUTH_HEADER)
      .send({ definitionType: 'SQL', definition: { sqlQuery } });
    expect(defRes.status).toBe(200);

    // A manual schema save keeps only server-owned statuses, so seed it like the other e2e specs.
    const schemaRes = await setDataMartSchema(agent, app, sqlMartId, {
      type: 'duckdb-data-mart-schema',
      fields: [
        {
          name: 'id',
          type: 'VARCHAR',
          status: 'CONNECTED',
          isPrimaryKey: true,
          isHiddenForReporting: false,
        },
        {
          name: 'event_ts',
          type: 'TIMESTAMP',
          status: 'CONNECTED',
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
        {
          name: 'name',
          type: 'VARCHAR',
          status: 'CONNECTED',
          isPrimaryKey: false,
          isHiddenForReporting: false,
        },
      ],
    });
    expect(schemaRes.status).toBe(200);

    const publishRes = await agent.put(`/api/data-marts/${sqlMartId}/publish`).set(AUTH_HEADER);
    expect(publishRes.status).toBe(200);

    // ============================================================================
    // Leg 1a -- create-view (direct): DataMartTableReferenceService.ensureSqlViewIsUpToDate
    // -> CreateViewService -> CreateViewExecutorFacade -> DuckDbCreateViewExecutor, via a
    // transient READ_WRITE open (Task 1). Assert the returned name AND independently
    // reopen the .duckdb file READ_ONLY to prove the physical view landed with the exact
    // connector-loaded values.
    // ============================================================================
    const sqlDataMart = await dataMartService.getByIdAndProjectId(sqlMartId, NULL_IDP_PROJECT_ID);
    const expectedViewName = `view_${sqlMartId.replace(/-/g, '_')}`;

    const viewFullyQualifiedName =
      await dataMartTableReferenceService.ensureSqlViewIsUpToDate(sqlDataMart);
    expect(viewFullyQualifiedName).toBe(expectedViewName);

    const viewOracle = await readViewOracle(dbPath, expectedViewName);
    expect(viewOracle.size).toBe(holidaysOracle.size);
    for (const [id, expected] of holidaysOracle) {
      const actual = viewOracle.get(id);
      expect(actual).toBeDefined();
      expect(actual!.name).toBe(expected.name);
      // CAST(date AS TIMESTAMP) must preserve the calendar day (appending 00:00:00).
      expect(actual!.eventTs.slice(0, 10)).toBe(expected.date);
    }

    // ============================================================================
    // Leg 1b -- create-view (through the product read path): a SUBSEQUENT
    // QueryDataMartService.run() over the SQL mart must return rows READ THROUGH the
    // view (ReportSqlComposerService resolves mainTableReference via the same
    // ensureSqlViewIsUpToDate chain whenever any output control -- here, `limit`, which
    // QueryDataMartService.run always sets -- is present).
    // ============================================================================
    const plainResult = await queryDataMartService.run(
      new QueryDataMartCommand({
        projectId: NULL_IDP_PROJECT_ID,
        userId: NULL_IDP_USER_ID,
        roles: NULL_IDP_ROLES,
        dataMartId: sqlMartId,
        fields: ['id', 'event_ts', 'name'],
        limit: 100,
      })
    );

    expect(plainResult.columns).toEqual(['id', 'event_ts', 'name']);
    const expectedRowCount = Math.min(holidaysOracle.size, 100);
    expect(plainResult.rows.length).toBeGreaterThan(0);
    expect(plainResult.rows.length).toBe(expectedRowCount);
    expect(plainResult.truncated).toBe(holidaysOracle.size > 100);

    const pIdIdx = plainResult.columns.indexOf('id');
    const pTsIdx = plainResult.columns.indexOf('event_ts');
    const pNameIdx = plainResult.columns.indexOf('name');
    const plainReturnedIds = new Set<string>();
    for (const row of plainResult.rows) {
      const id = String(row[pIdIdx]);
      const expected = holidaysOracle.get(id);
      expect(expected).toBeDefined();
      expect(String(row[pTsIdx]).slice(0, 10)).toBe(expected!.date);
      expect(String(row[pNameIdx])).toBe(expected!.name);
      plainReturnedIds.add(id);
    }
    expect(plainReturnedIds.size).toBe(expectedRowCount);

    // ============================================================================
    // Leg 2 -- sql-run: SqlRunService.runBatches (Task 2) streams the mart's OWN SQL
    // (sql: undefined -> definition.sqlQuery verbatim) directly against the storage,
    // batched via maxRowsPerBatch. Real rows + real columns, oracle-checked.
    // ============================================================================
    const maxRowsPerBatch = Math.max(1, Math.floor(holidaysOracle.size / 2));
    const sqlRunRows: Record<string, unknown>[] = [];
    let sqlRunBatchCount = 0;
    for await (const batch of sqlRunService.runBatches(
      new SqlRunCommand(sqlMartId, NULL_IDP_PROJECT_ID, undefined, maxRowsPerBatch)
    )) {
      sqlRunBatchCount++;
      expect(batch.columns).toEqual(['id', 'event_ts', 'name']);
      sqlRunRows.push(...batch.rows);
    }

    // maxRowsPerBatch is sized to force >1 batch whenever there's more than one row --
    // proves this is a genuine chunked stream, not a single blob dressed up as a batch.
    if (holidaysOracle.size >= 2) {
      expect(sqlRunBatchCount).toBeGreaterThanOrEqual(2);
    }

    expect(sqlRunRows.length).toBe(holidaysOracle.size);
    const sqlRunReturnedIds = new Set<string>();
    for (const row of sqlRunRows) {
      const id = String(row.id);
      const expected = holidaysOracle.get(id);
      expect(expected).toBeDefined();
      expect(String(row.event_ts).slice(0, 10)).toBe(expected!.date);
      expect(String(row.name)).toBe(expected!.name);
      sqlRunReturnedIds.add(id);
    }
    expect(sqlRunReturnedIds.size).toBe(holidaysOracle.size);

    // ============================================================================
    // Leg 3 -- timezone: a dateTrunc + non-UTC timeZone must bucket into the SHIFTED
    // zone, not UTC (Task 4's double AT TIME ZONE shift). Oracle: independently
    // recompute, in JS, the calendar day each stored midnight-UTC instant falls on in
    // NON_UTC_ZONE (Intl, not the SQL engine under test), and assert DuckDB's own
    // bucketed output matches it -- and differs from the raw UTC day.
    // ============================================================================
    const tzResult = await queryDataMartService.run(
      new QueryDataMartCommand({
        projectId: NULL_IDP_PROJECT_ID,
        userId: NULL_IDP_USER_ID,
        roles: NULL_IDP_ROLES,
        dataMartId: sqlMartId,
        fields: ['id', 'event_ts', 'name'],
        dateTruncConfig: [{ column: 'event_ts', unit: 'DAY', timeZone: NON_UTC_ZONE }],
        limit: 100,
      })
    );

    expect(tzResult.columns).toEqual(['id', 'event_ts', 'name']);
    expect(tzResult.rows.length).toBe(expectedRowCount);

    const tzIdIdx = tzResult.columns.indexOf('id');
    const tzTsIdx = tzResult.columns.indexOf('event_ts');
    const tzReturnedIds = new Set<string>();
    for (const row of tzResult.rows) {
      const id = String(row[tzIdIdx]);
      const expected = holidaysOracle.get(id);
      expect(expected).toBeDefined();

      const expectedZonedDay = utcMidnightDayInZone(expected!.date, NON_UTC_ZONE);
      const actualBucketedDay = String(row[tzTsIdx]).slice(0, 10);

      expect(actualBucketedDay).toBe(expectedZonedDay);
      // NON_UTC_ZONE is always behind UTC -- a midnight-UTC instant therefore ALWAYS
      // rolls back one calendar day; this must differ from the raw UTC date, or the
      // "shift" would be a no-op (proving nothing about the timezone path).
      expect(actualBucketedDay).not.toBe(expected!.date);

      tzReturnedIds.add(id);
    }
    expect(tzReturnedIds.size).toBe(expectedRowCount);
  }, 120_000);
});

/**
 * Polls `GET /api/data-marts/:id/runs/:runId` until the run reaches a terminal
 * status. The connector run trigger is processed by a 5s cron
 * (see ConnectorRunTriggerHandlerService.processingCronExpression), so this
 * budgets well beyond that plus real network fetch + child-process spawn time.
 *
 * Copied verbatim from duckdb-storage-load.e2e-spec.ts / duckdb-query-path.e2e-spec.ts
 * (SP-B1/SP-B2) -- not shared/exported between e2e-spec files, so each file owns its own
 * copy.
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

/**
 * Re-opens the connector-written `.duckdb` file READ_ONLY (same technique as
 * duckdb-storage-load/duckdb-query-path's e2e: production options, independent of the
 * product's own read path) and reads the raw `main.holidays` rows, keyed by the
 * connector's unique key (`id`).
 */
async function readHolidaysOracle(
  dbPath: string
): Promise<Map<string, { date: string; name: string }>> {
  const instance = await createHardenedInstance(dbPath, { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    const qualifiedTable = escapeDuckDbIdentifier('main.holidays');
    const reader = await connection.runAndReadAll(`SELECT id, date, name FROM ${qualifiedTable}`);
    const rows = reader.getRowObjects() as Array<Record<string, unknown>>;
    return new Map(
      rows.map(row => [String(row.id), { date: String(row.date), name: String(row.name) }])
    );
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

/**
 * Re-opens the SAME `.duckdb` file READ_ONLY and reads through the DuckDB view the
 * create-view leg is expected to have created -- independent of the product's own read
 * path, proving the physical DDL landed (not just that the service call didn't throw).
 */
async function readViewOracle(
  dbPath: string,
  viewName: string
): Promise<Map<string, { eventTs: string; name: string }>> {
  const instance = await createHardenedInstance(dbPath, { access_mode: 'READ_ONLY' });
  const connection = await instance.connect();
  try {
    const qualifiedView = escapeDuckDbIdentifier(viewName);
    const reader = await connection.runAndReadAll(
      `SELECT id, event_ts, name FROM ${qualifiedView}`
    );
    const rows = reader.getRowObjects() as Array<Record<string, unknown>>;
    return new Map(
      rows.map(row => [String(row.id), { eventTs: String(row.event_ts), name: String(row.name) }])
    );
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}

/**
 * Independently (in JS, via Intl -- NOT the SQL engine under test) computes which calendar
 * day a midnight-UTC instant falls on in `timeZone`. Mirrors the semantics
 * DuckDbClauseRenderer.renderDateTrunc's `(col AT TIME ZONE 'UTC') AT TIME ZONE '<tz>'`
 * double-shift is meant to produce: reinterpret the naive value as a UTC instant, then read
 * its calendar date in the target zone.
 */
function utcMidnightDayInZone(isoDate: string, timeZone: string): string {
  const utcInstant = new Date(`${isoDate}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(utcInstant);
  const get = (type: string): string => parts.find(p => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
