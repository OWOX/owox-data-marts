import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { BigQueryApiAdapter } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api.adapter';
import { BigQueryServiceAccountCredentialsSchema } from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import {
  BigQueryConfig,
  BIGQUERY_AUTODETECT_LOCATION,
} from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema';
import {
  QueryDataMartService,
  QueryDataMartCommand,
} from 'src/data-marts/use-cases/query-data-mart.service';
import { DataMartService } from 'src/data-marts/services/data-mart.service';

/**
 * QueryDataMartService — real BigQuery integration (Level R2)
 *
 * Proves that QueryDataMartService.run() (the `query_data_mart` MCP tool backend)
 * correctly executes an AGGREGATED query against a real BigQuery table and that the
 * response reflects the aggregated output columns — not the raw `fields` list passed in.
 *
 * The alignment gap being closed: unit tests mock the reader, so the header/column
 * rewriting that happens for an aggregated query (dim + metric → dim, <metric> | SUM,
 * Row Count) is only verified live here.
 *
 * Seed data (dim STRING, revenue FLOAT64):
 *   ('a', 10.0), ('a', 5.0), ('b', 3.0)
 *
 * Expected aggregated output grouped by dim with SUM(revenue):
 *   dim='a' → revenue | SUM = 15.0,  Row Count = 2
 *   dim='b' → revenue | SUM =  3.0,  Row Count = 1
 *
 * Required environment variables (loaded from .env.tests via setup-env.ts):
 *   BQ_SERVICE_ACCOUNT_KEY  - JSON string of a GCP service account key
 *   BQ_PROJECT_ID           - GCP project ID
 *   BQ_DATASET              - BigQuery dataset name (must already exist)
 */

const BQ_SERVICE_ACCOUNT_KEY = process.env.BQ_SERVICE_ACCOUNT_KEY;
const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID;
const BQ_DATASET = process.env.BQ_DATASET;

const BQ_CREDENTIALS_AVAILABLE = !!(BQ_SERVICE_ACCOUNT_KEY && BQ_PROJECT_ID && BQ_DATASET);

if (!BQ_CREDENTIALS_AVAILABLE) {
  console.log(
    'Skipping query-data-mart real BigQuery integration tests: BQ_SERVICE_ACCOUNT_KEY, BQ_PROJECT_ID, or BQ_DATASET not set'
  );
}

const describeIfCredentials = BQ_CREDENTIALS_AVAILABLE ? describe : describe.skip;

// NullIdpProvider (used by createTestApp) authenticates `test-token` as userId '0',
// projectId '0', roles ['admin']. AccessDecisionService uses the admin shortcut and
// allows SEE on any data mart — no ownership/context check needed.
const NULL_IDP_PROJECT_ID = '0';
const NULL_IDP_USER_ID = '0';
const NULL_IDP_ROLES = ['admin'];

describeIfCredentials('QueryDataMartService — aggregated query on real BigQuery', () => {
  let app: INestApplication;
  let agent: supertest.Agent;
  let dataMartId: string;

  let queryDataMartService: QueryDataMartService;
  let dataMartService: DataMartService;

  let bqAdapter: BigQueryApiAdapter;
  let bqConfig: BigQueryConfig;
  let bqFullyQualifiedName: string;

  const BQ_TEST_TABLE = `qry_dm_real_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    agent = testApp.agent;

    queryDataMartService = app.get(QueryDataMartService);
    dataMartService = app.get(DataMartService);

    // --- Seed a temporary BigQuery table with one STRING dimension and one FLOAT64 metric ---
    const bqCredentials = BigQueryServiceAccountCredentialsSchema.parse(
      JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
    );
    bqConfig = {
      projectId: BQ_PROJECT_ID!,
      location: BIGQUERY_AUTODETECT_LOCATION,
    };
    bqAdapter = new BigQueryApiAdapter(bqCredentials, bqConfig);
    bqFullyQualifiedName = `${BQ_PROJECT_ID}.${BQ_DATASET}.${BQ_TEST_TABLE}`;

    // Pre-cleanup in case a previous run crashed before teardown.
    try {
      await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqFullyQualifiedName}\``);
    } catch {
      // ignore
    }

    await bqAdapter.executeQuery(
      `CREATE TABLE \`${bqFullyQualifiedName}\` (dim STRING, revenue FLOAT64)`
    );

    // Insert inline test data via UNNEST — no external data source required.
    // dim='a' appears twice (10.0 + 5.0 = 15.0 when summed); dim='b' once (3.0).
    await bqAdapter.executeQuery(
      `INSERT INTO \`${bqFullyQualifiedName}\` (dim, revenue)
       SELECT dim, revenue FROM UNNEST([
         STRUCT('a' AS dim, 10.0 AS revenue),
         STRUCT('a' AS dim,  5.0 AS revenue),
         STRUCT('b' AS dim,  3.0 AS revenue)
       ])`
    );

    // --- Create credentialed BigQuery storage via HTTP API ---
    const storageCreateRes = await agent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({ type: 'GOOGLE_BIGQUERY' });
    if (storageCreateRes.status !== 201) {
      console.error('BQ storage create failed:', JSON.stringify(storageCreateRes.body, null, 2));
    }
    expect(storageCreateRes.status).toBe(201);
    const storageId: string = storageCreateRes.body.id;

    const storageUpdateRes = await agent
      .put(`/api/data-storages/${storageId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'bq-qry-dm-real',
        config: { projectId: BQ_PROJECT_ID! },
        credentials: JSON.parse(BQ_SERVICE_ACCOUNT_KEY!),
      });
    if (storageUpdateRes.status !== 200) {
      console.error('BQ storage update failed:', JSON.stringify(storageUpdateRes.body, null, 2));
    }
    expect(storageUpdateRes.status).toBe(200);

    // --- Create data mart ---
    const dataMartCreateRes = await agent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: 'qry-dm-real-test', storageId });
    if (dataMartCreateRes.status !== 201) {
      console.error('Data mart create failed:', JSON.stringify(dataMartCreateRes.body, null, 2));
    }
    expect(dataMartCreateRes.status).toBe(201);
    dataMartId = dataMartCreateRes.body.id;

    // --- Point the mart at the seeded table (TABLE definition) ---
    const defRes = await agent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'TABLE',
        definition: { fullyQualifiedName: bqFullyQualifiedName },
      });
    if (defRes.status !== 200) {
      console.error('Definition set failed:', JSON.stringify(defRes.body, null, 2));
    }
    expect(defRes.status).toBe(200);

    // Publish transitions the mart status to PUBLISHED and validates the definition
    // (checks the BQ table exists), but does NOT populate the schema.
    const publishRes = await agent.put(`/api/data-marts/${dataMartId}/publish`).set(AUTH_HEADER);
    if (publishRes.status !== 200) {
      console.error('Publish failed:', JSON.stringify(publishRes.body, null, 2));
    }
    expect(publishRes.status).toBe(200);

    // Actualize schema: reads the live BQ table metadata (field names + types) and
    // persists it. QueryDataMartService.run() loads the entity from the DB, so the
    // schema must be stored before we call run().
    const dataMart = await dataMartService.getByIdAndProjectId(dataMartId, NULL_IDP_PROJECT_ID);
    await dataMartService.actualizeSchemaInEntity(dataMart);
    await dataMartService.save(dataMart);
  }, 180000);

  afterAll(async () => {
    try {
      await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqFullyQualifiedName}\``);
    } catch (error) {
      console.warn('Failed to drop BQ test table during teardown:', error);
    }

    if (app) {
      await closeTestApp(app);
    }
  }, 60000);

  it('aggregated query returns grouped columns, summed revenues, non-null totals, and truncated=false', async () => {
    const result = await queryDataMartService.run(
      new QueryDataMartCommand({
        projectId: NULL_IDP_PROJECT_ID,
        userId: NULL_IDP_USER_ID,
        roles: NULL_IDP_ROLES,
        dataMartId,
        fields: ['dim', 'revenue'],
        aggregationConfig: [{ column: 'revenue', function: 'SUM' }],
        limit: 100,
      })
    );

    // --- columns must reflect the executed aggregated SQL, NOT the raw `fields` list ---
    // 'dim' is a GROUP BY key → stays as 'dim'.
    // 'revenue' is aggregated with SUM → becomes 'revenue | SUM'.
    // Row Count is appended automatically for every aggregated query.
    expect(result.columns).toContain('dim');
    expect(result.columns).toContain('revenue | SUM');
    expect(result.columns).toContain('Row Count');
    // The raw 'revenue' column must NOT appear — it was aggregated away.
    expect(result.columns).not.toContain('revenue');

    // --- rows are grouped by dim (one row per distinct dim value: 'a' and 'b') ---
    expect(result.rows).toHaveLength(2);

    const dimIdx = result.columns.indexOf('dim');
    const sumIdx = result.columns.indexOf('revenue | SUM');
    const rowCountIdx = result.columns.indexOf('Row Count');

    const byDim = new Map(result.rows.map(row => [String(row[dimIdx]), row]));
    expect(byDim.has('a')).toBe(true);
    expect(byDim.has('b')).toBe(true);

    // dim='a': 10.0 + 5.0 = 15.0 with 2 source rows
    expect(Number(byDim.get('a')![sumIdx])).toBeCloseTo(15.0, 5);
    expect(Number(byDim.get('a')![rowCountIdx])).toBe(2);

    // dim='b': 3.0 with 1 source row
    expect(Number(byDim.get('b')![sumIdx])).toBeCloseTo(3.0, 5);
    expect(Number(byDim.get('b')![rowCountIdx])).toBe(1);

    // --- totals is a non-null block (server-side grand totals over all rows) ---
    expect(result.totals).not.toBeNull();

    // --- not truncated for this 3-row dataset with limit=100 ---
    expect(result.truncated).toBe(false);
  }, 180000);
});
