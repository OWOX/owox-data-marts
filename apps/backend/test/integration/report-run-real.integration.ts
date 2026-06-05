import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { AthenaApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/athena-api.adapter';
import { S3ApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/s3-api.adapter';
import { AthenaCredentials } from 'src/data-marts/data-storage-types/athena/schemas/athena-credentials.schema';
import { AthenaConfig } from 'src/data-marts/data-storage-types/athena/schemas/athena-config.schema';
import { ReportSqlComposerService } from 'src/data-marts/services/report-sql-composer.service';
import { DataMartService } from 'src/data-marts/services/data-mart.service';
import { DATA_STORAGE_REPORT_READER_RESOLVER } from 'src/data-marts/data-storage-types/data-storage-providers';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from 'src/data-marts/data-storage-types/interfaces/data-storage-report-reader.interface';
import { TypeResolver } from 'src/common/resolver/type-resolver';
import { ReportLikeReadPlan } from 'src/data-marts/dto/domain/report-like-read-plan';
import { BlendableSchemaAccessor } from 'src/data-marts/services/blendable-schema.service';

/**
 * Report-run path — real Athena integration (Level R2)
 *
 * Proves that the REPORT consumer of the shared output-controls pipeline applies
 * filter/sort/limit on a LIVE Athena table — independent of the HTTP Data
 * consumer that http-data-real.integration.ts already covers.
 *
 * Why R2 (read path, no real destination):
 *   The test environment ships only Athena + BigQuery credentials in .env.tests.
 *   There is NO Google Sheets / Looker Studio destination credential, and the
 *   google-sheets integration suite is force-skipped (non-working). A full R1
 *   run (RunReportService.run -> trigger -> handler -> executeExistingRun ->
 *   real destination writer) therefore cannot reach a real destination here.
 *
 *   Instead this suite drives the SAME services that RunReportService.executeReport
 *   uses for a non-blended report carrying output controls:
 *     1. ReportSqlComposerService.compose(report, accessor) -> { sql, params }
 *     2. AthenaReportReader.prepareReportData(report, { sqlOverride, sqlOverrideParams,
 *        columnFilter }) + readReportDataBatch(...) until exhausted
 *   Both services are resolved from the REAL Nest DI container (createTestApp),
 *   with all collaborators real — only the destination write (covered by GBQ
 *   report e2e) is omitted. This is the storage-side guarantee of the report
 *   reader/composer path on live Athena.
 *
 * Required environment variables (loaded from .env.tests), same gate as
 * http-data-real / athena.integration:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ATHENA_REGION,
 *   ATHENA_OUTPUT_BUCKET, ATHENA_DATABASE
 */

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const ATHENA_REGION = process.env.ATHENA_REGION;
const ATHENA_OUTPUT_BUCKET = process.env.ATHENA_OUTPUT_BUCKET;
const ATHENA_DATABASE = process.env.ATHENA_DATABASE;

const ATHENA_CREDENTIALS_AVAILABLE = !!(
  AWS_ACCESS_KEY_ID &&
  AWS_SECRET_ACCESS_KEY &&
  ATHENA_REGION &&
  ATHENA_OUTPUT_BUCKET &&
  ATHENA_DATABASE
);

if (!ATHENA_CREDENTIALS_AVAILABLE) {
  console.log(
    'Skipping report-run real Athena integration tests: AWS credentials or Athena config not set'
  );
}

const describeIfCredentials = ATHENA_CREDENTIALS_AVAILABLE ? describe : describe.skip;

// NullIdpProvider (used by createTestApp) authenticates `test-token` as a single
// admin user in a single project — userId '0', projectId '0', role 'admin'.
// This mirrors what resolveBlendableSchemaAccessor would produce on the run path.
const NULL_IDP_PROJECT_ID = '0';
const ACCESSOR: BlendableSchemaAccessor = { userId: '0', roles: ['admin'] };

describeIfCredentials('Report-run path applies output controls on real Athena (R2)', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;

  let composer: ReportSqlComposerService;
  let dataMartService: DataMartService;
  let readerResolver: TypeResolver<DataStorageType, DataStorageReportReader>;

  // Raw Athena adapters for seed/cleanup — same pattern as athena.integration.ts
  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let config: AthenaConfig;
  let database: string;

  const TEST_TABLE_SUFFIX = `report_run_real_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const TEST_S3_PREFIX = `integration-test/${TEST_TABLE_SUFFIX}/`;

  // Mirrors RunReportService.executeReport for a non-blended report with output
  // controls: compose full SQL + params, then prepare + drain the reader.
  async function runReportReadPath(report: ReportLikeReadPlan): Promise<Record<string, string>[]> {
    const decision = await composer['blendedReportDataService'].resolveBlendingDecision(
      report,
      ACCESSOR
    );
    const composed = await composer.compose(report, ACCESSOR, decision);

    const reader = await readerResolver.resolve(DataStorageType.AWS_ATHENA);
    const rows: Record<string, string>[] = [];
    try {
      const description = await reader.prepareReportData(report, {
        sqlOverride: composed.sql,
        sqlOverrideParams: composed.params,
        columnFilter: decision.columnFilter,
        blendedDataHeaders: decision.blendedDataHeaders,
      });
      const headerNames = description.dataHeaders.map(h => h.name);

      let nextBatchId: string | undefined = undefined;
      do {
        const batch = await reader.readReportDataBatch(nextBatchId);
        for (const dataRow of batch.dataRows) {
          const obj: Record<string, string> = {};
          headerNames.forEach((name, i) => {
            obj[name] = dataRow[i] as string;
          });
          rows.push(obj);
        }
        nextBatchId = batch.nextDataBatchId ?? undefined;
      } while (nextBatchId);
    } finally {
      await reader.finalize();
    }
    return rows;
  }

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    composer = app.get(ReportSqlComposerService);
    dataMartService = app.get(DataMartService);
    readerResolver = app.get(DATA_STORAGE_REPORT_READER_RESOLVER);

    config = {
      region: ATHENA_REGION!,
      outputBucket: ATHENA_OUTPUT_BUCKET!,
    };
    const credentials: AthenaCredentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };
    adapter = new AthenaApiAdapter(credentials, config);
    s3Adapter = new S3ApiAdapter(credentials, config);
    database = ATHENA_DATABASE!;

    // --- Pre-cleanup in case a previous run crashed ---
    try {
      const { queryExecutionId: dropId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${TEST_S3_PREFIX}cleanup/`
      );
      await adapter.waitForQueryToComplete(dropId);
    } catch {
      // ignore
    }

    // --- Seed a real Athena table (id/name/active/created_at + amount) ---
    const ctasQuery = `CREATE TABLE "${database}"."${TEST_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${TEST_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (1, 'alpha',    true,  TIMESTAMP '2024-01-01 00:00:00.000', 100),
  (2, 'beta',     false, TIMESTAMP '2024-02-01 00:00:00.000', 200),
  (3, 'gamma',    true,  TIMESTAMP '2024-03-01 00:00:00.000', 300),
  (4, 'alphabet', true,  TIMESTAMP '2024-04-01 00:00:00.000', 400)
) AS t (id, name, active, created_at, amount)`;
    const { queryExecutionId } = await adapter.executeQuery(
      ctasQuery,
      config.outputBucket,
      `${TEST_S3_PREFIX}ctas/`
    );
    await adapter.waitForQueryToComplete(queryExecutionId);

    // --- Build a credentialed Athena data mart via the HTTP API (so it has a
    //     real published schema + storage credential the readers can resolve) ---
    const storageCreateRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({ type: 'AWS_ATHENA' });
    expect(storageCreateRes.status).toBe(201);
    const storageId: string = storageCreateRes.body.id;

    const storageUpdateRes = await agent
      .put(`/api/data-storages/${storageId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'athena-report-run-real',
        config: { region: ATHENA_REGION!, outputBucket: ATHENA_OUTPUT_BUCKET! },
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID!,
          secretAccessKey: AWS_SECRET_ACCESS_KEY!,
        },
      });
    expect(storageUpdateRes.status).toBe(200);

    const dataMartCreateRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: 'report-run-real-mart', storageId });
    expect(dataMartCreateRes.status).toBe(201);
    dataMartId = dataMartCreateRes.body.id;

    const defRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'TABLE',
        definition: { fullyQualifiedName: `${database}.${TEST_TABLE_SUFFIX}` },
      });
    expect(defRes.status).toBe(200);

    const publishRes = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER);
    expect(publishRes.status).toBe(200);
  }, 180000);

  afterAll(async () => {
    try {
      const { queryExecutionId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${TEST_S3_PREFIX}drop/`
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
    } catch (error) {
      console.warn('Failed to drop test table during teardown:', error);
    }

    try {
      // Single scoped sweep of this run's unique root (data, ctas, cleanup, drop,
      // query results all live under TEST_S3_PREFIX).
      await s3Adapter.cleanupOutputFiles(config.outputBucket, TEST_S3_PREFIX);
    } catch (error) {
      console.warn('Failed to clean up S3 output files:', error);
    }

    if (app) {
      await closeTestApp(app);
    }
  }, 90000);

  // Loads the persisted DataMart entity (storage + credential + definition +
  // schema) exactly as RunReportService does via the report it executes.
  async function buildReport(
    overrides: Partial<Omit<ReportLikeReadPlan, 'dataMart'>>
  ): Promise<ReportLikeReadPlan> {
    const dataMart = await dataMartService.getByIdAndProjectId(dataMartId, NULL_IDP_PROJECT_ID);
    // Mirror RunReportService.actualizeSchemaInDataMart — the run path refreshes
    // and persists the live schema before executing, which the validator/reader rely on.
    await dataMartService.actualizeSchemaInEntity(dataMart);
    await dataMartService.save(dataMart);
    return { dataMart, ...overrides };
  }

  it('applies an eq filter (name=alpha) — only the matching row is read', async () => {
    const report = await buildReport({
      columnConfig: ['id', 'name'],
      filterConfig: [{ column: 'name', operator: 'eq', value: 'alpha' }],
    });

    const rows = await runReportReadPath(report);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alpha');
    expect(String(rows[0].id)).toBe('1');
  }, 180000);

  it('applies sort desc + limit — correct order and count', async () => {
    const report = await buildReport({
      columnConfig: ['id', 'name'],
      sortConfig: [{ column: 'id', direction: 'desc' }],
      limitConfig: 2,
    });

    const rows = await runReportReadPath(report);

    expect(rows.map(r => String(r.id))).toEqual(['4', '3']);
    expect(rows.map(r => r.name)).toEqual(['alphabet', 'gamma']);
  }, 180000);

  it('filters on a column that is NOT in columnConfig (amount) — filtered, not projected', async () => {
    // SELECT only id+name, but FILTER on `amount` (not selected). Proves the
    // composed report SQL filters by a non-projected column and that column is
    // absent from the read rows.
    const report = await buildReport({
      columnConfig: ['id', 'name'],
      filterConfig: [{ column: 'amount', operator: 'gte', value: 300 }],
      sortConfig: [{ column: 'id', direction: 'asc' }],
    });

    const rows = await runReportReadPath(report);

    // amount >= 300 → ids 3,4
    expect(rows.map(r => String(r.id))).toEqual(['3', '4']);
    expect(rows.map(r => r.name)).toEqual(['gamma', 'alphabet']);

    // The filter column (amount) must NOT be projected.
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['id', 'name']);
      expect(row).not.toHaveProperty('amount');
    }
  }, 180000);
});
