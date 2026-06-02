import { INestApplication } from '@nestjs/common';
import * as supertest from 'supertest';
import { AUTH_HEADER, closeTestApp, createTestApp } from '@owox/test-utils';
import { AthenaApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/athena-api.adapter';
import { S3ApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/s3-api.adapter';
import { AthenaCredentials } from 'src/data-marts/data-storage-types/athena/schemas/athena-credentials.schema';
import { AthenaConfig } from 'src/data-marts/data-storage-types/athena/schemas/athena-config.schema';
import { BigQueryApiAdapter } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api.adapter';
import { BigQueryServiceAccountCredentialsSchema } from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import {
  BigQueryConfig,
  BIGQUERY_AUTODETECT_LOCATION,
} from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema';
import { STREAM_BATCH_SIZE } from 'src/data-marts/services/http-data/http-data.constants';

/**
 * HTTP Data API Real Integration Tests
 *
 * Proves the GET /api/external/http-data/data-marts/{id}.ndjson endpoint
 * downloads REAL rows from REAL cloud tables through the FULL app stack.
 *
 * Unlike test/http-data.e2e-spec.ts, NO readers or schema providers are mocked here.
 * A single NestJS app instance is shared across all describe blocks in this file
 * to avoid the TypeORM transactional context singleton conflict.
 *
 * Required environment variables (loaded from .env.tests):
 *   Athena:
 *     AWS_ACCESS_KEY_ID      - AWS access key ID
 *     AWS_SECRET_ACCESS_KEY  - AWS secret access key
 *     ATHENA_REGION          - AWS region (e.g., eu-north-1)
 *     ATHENA_OUTPUT_BUCKET   - S3 bucket for Athena query results (without s3:// prefix)
 *     ATHENA_DATABASE        - Athena database name (must already exist)
 *   BigQuery:
 *     BQ_SERVICE_ACCOUNT_KEY - JSON string of a GCP service account key
 *     BQ_PROJECT_ID          - GCP project ID
 *     BQ_DATASET             - BigQuery dataset name (must already exist)
 */

// ---------------------------------------------------------------------------
// Athena env vars / credential gate
// ---------------------------------------------------------------------------
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
    'Skipping HTTP Data real Athena integration tests: AWS credentials or Athena config not set'
  );
}

const describeIfCredentials = ATHENA_CREDENTIALS_AVAILABLE ? describe : describe.skip;

// ---------------------------------------------------------------------------
// BigQuery env vars / credential gate
// ---------------------------------------------------------------------------
const BQ_SERVICE_ACCOUNT_KEY = process.env.BQ_SERVICE_ACCOUNT_KEY;
const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID;
const BQ_DATASET = process.env.BQ_DATASET;

const BQ_CREDENTIALS_AVAILABLE = !!(BQ_SERVICE_ACCOUNT_KEY && BQ_PROJECT_ID && BQ_DATASET);

if (!BQ_CREDENTIALS_AVAILABLE) {
  console.log(
    'Skipping HTTP Data real BigQuery integration tests: BQ_SERVICE_ACCOUNT_KEY, BQ_PROJECT_ID, or BQ_DATASET not set'
  );
}

const describeIfBqCredentials = BQ_CREDENTIALS_AVAILABLE ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Shared NestJS app — ONE instance for the entire file.
// Both describe blocks share the same SQLite :memory: app to avoid the
// TypeORM / typeorm-transactional DataSource singleton conflict that arises
// when createTestApp() is called more than once in a single Jest worker process.
// ---------------------------------------------------------------------------
let sharedApp: INestApplication;
let sharedAgent: supertest.Agent;

// Create the shared app if at least one credential set is present.
const NEED_APP = ATHENA_CREDENTIALS_AVAILABLE || BQ_CREDENTIALS_AVAILABLE;

if (NEED_APP) {
  beforeAll(async () => {
    const testApp = await createTestApp();
    sharedApp = testApp.app;
    sharedAgent = testApp.agent;
  }, 60000);

  afterAll(async () => {
    if (sharedApp) {
      await closeTestApp(sharedApp);
    }
  }, 30000);
}

// =============================================================================
// ATHENA BLOCK
// =============================================================================

describeIfCredentials('HTTP Data API — real Athena integration (full stack, no mocks)', () => {
  let dataMartId: string;

  // Raw Athena adapters for seed/cleanup — same pattern as athena.integration.ts
  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let credentials: AthenaCredentials;
  let config: AthenaConfig;
  let database: string;

  const TEST_TABLE_SUFFIX = `http_data_real_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const TEST_S3_PREFIX = `integration-test/${TEST_TABLE_SUFFIX}/`;

  // -------------------------------------------------------------------------
  // beforeAll: seed real Athena table + build credentialed mart via HTTP API
  // -------------------------------------------------------------------------
  beforeAll(async () => {
    credentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };
    config = {
      region: ATHENA_REGION!,
      outputBucket: ATHENA_OUTPUT_BUCKET!,
    };
    adapter = new AthenaApiAdapter(credentials, config);
    s3Adapter = new S3ApiAdapter(credentials, config);
    database = ATHENA_DATABASE!;

    // --- Step 1: Pre-cleanup in case a previous run crashed ---
    try {
      const { queryExecutionId: dropId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${TEST_S3_PREFIX}cleanup/`
      );
      await adapter.waitForQueryToComplete(dropId);
    } catch {
      // Ignore errors during pre-cleanup
    }

    // --- Step 2: Seed real Athena table via CTAS ---
    const ctasQuery = `CREATE TABLE "${database}"."${TEST_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${TEST_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (1, 'alpha',    true,  TIMESTAMP '2024-01-01 00:00:00.000'),
  (2, 'beta',     false, TIMESTAMP '2024-02-01 00:00:00.000'),
  (3, 'gamma',    true,  TIMESTAMP '2024-03-01 00:00:00.000'),
  (4, 'alphabet', true,  TIMESTAMP '2024-04-01 00:00:00.000')
) AS t (id, name, active, created_at)`;

    const { queryExecutionId } = await adapter.executeQuery(
      ctasQuery,
      config.outputBucket,
      `${TEST_S3_PREFIX}ctas/`
    );
    await adapter.waitForQueryToComplete(queryExecutionId);

    // --- Step 3: Create credentialed Athena storage via HTTP API ---
    const storageCreateRes = await sharedAgent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({ type: 'AWS_ATHENA' });
    if (storageCreateRes.status !== 201) {
      console.error('Storage create failed:', JSON.stringify(storageCreateRes.body, null, 2));
    }
    expect(storageCreateRes.status).toBe(201);
    const storageId: string = storageCreateRes.body.id;

    const storageUpdateRes = await sharedAgent
      .put(`/api/data-storages/${storageId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'athena-real-integration',
        config: { region: ATHENA_REGION!, outputBucket: ATHENA_OUTPUT_BUCKET! },
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID!,
          secretAccessKey: AWS_SECRET_ACCESS_KEY!,
        },
      });
    if (storageUpdateRes.status !== 200) {
      console.error('Storage update failed:', JSON.stringify(storageUpdateRes.body, null, 2));
    }
    expect(storageUpdateRes.status).toBe(200);

    // --- Step 4: Create data mart ---
    const dataMartCreateRes = await sharedAgent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: 'real-athena-test-mart', storageId });
    if (dataMartCreateRes.status !== 201) {
      console.error('Data mart create failed:', JSON.stringify(dataMartCreateRes.body, null, 2));
    }
    expect(dataMartCreateRes.status).toBe(201);
    dataMartId = dataMartCreateRes.body.id;

    // --- Step 5: Set TABLE definition (pointing at the real seeded table) ---
    const defRes = await sharedAgent
      .put(`/api/data-marts/${dataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'TABLE',
        definition: { fullyQualifiedName: `${database}.${TEST_TABLE_SUFFIX}` },
      });
    if (defRes.status !== 200) {
      console.error('Definition set failed:', JSON.stringify(defRes.body, null, 2));
    }
    expect(defRes.status).toBe(200);

    // --- Step 6: Publish (reads real schema from Athena) ---
    const publishRes = await sharedAgent
      .put(`/api/data-marts/${dataMartId}/publish`)
      .set(AUTH_HEADER);
    if (publishRes.status !== 200) {
      console.error('Publish failed:', JSON.stringify(publishRes.body, null, 2));
    }
    expect(publishRes.status).toBe(200);
  }, 180000);

  // -------------------------------------------------------------------------
  // afterAll: drop table + clean S3
  // -------------------------------------------------------------------------
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
  }, 90000);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  async function fetchNdjson(qs: string): Promise<Record<string, unknown>[]> {
    const res = await sharedAgent
      .get(`/api/external/http-data/data-marts/${dataMartId}.ndjson${qs ? '?' + qs : ''}`)
      .set(AUTH_HEADER);
    if (res.status !== 200) {
      console.error('fetchNdjson failed:', res.status, JSON.stringify(res.body, null, 2));
      console.error('Response text:', res.text?.slice(0, 500));
    }
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    return res.text
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  }

  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

  // -------------------------------------------------------------------------
  // Test A — WITHOUT output controls (streams all real rows)
  // -------------------------------------------------------------------------
  it('streams all real rows from Athena without output controls', async () => {
    const rows = await fetchNdjson('column=id&column=name&column=active');
    expect(rows).toHaveLength(4);

    // Build a lookup by id (Athena returns numeric ids — coerce to string for safety)
    const byId = Object.fromEntries(rows.map(r => [String(r.id), r]));
    expect(byId['1'].name).toBe('alpha');
    expect(byId['2'].name).toBe('beta');
    expect(byId['4'].name).toBe('alphabet');
  }, 120000);

  // -------------------------------------------------------------------------
  // Test B — WITH output controls (filter/sort/limit on real data)
  // -------------------------------------------------------------------------
  it('applies eq filter on real Athena data', async () => {
    const rows = await fetchNdjson(
      `column=id&column=name&filter=${b64([{ column: 'name', operator: 'eq', value: 'alpha' }])}`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alpha');
  }, 120000);

  it('applies contains + sort desc + limit on real Athena data', async () => {
    // Both 'alpha' (id=1) and 'alphabet' (id=4) contain 'alpha'
    // sort desc by id + limit 1 → should yield id=4 ('alphabet')
    const rows = await fetchNdjson(
      `column=id&column=name` +
        `&filter=${b64([{ column: 'name', operator: 'contains', value: 'alpha' }])}` +
        `&sort=${b64([{ column: 'id', direction: 'desc' }])}` +
        `&limit=1`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alphabet');
  }, 120000);

  it('applies a numeric between filter on real Athena data', async () => {
    const rows = await fetchNdjson(
      `column=id&column=name&filter=${b64([{ column: 'id', operator: 'between', value: { from: 2, to: 3 } }])}&sort=${b64([{ column: 'id', direction: 'asc' }])}`
    );
    expect(rows.map(r => String(r.id))).toEqual(['2', '3']);
  }, 120000);

  // -------------------------------------------------------------------------
  // Scenario #12 — filter on a column that is NOT in the selection
  // SELECT only `name`, but FILTER on `id` (numeric). Proves you can filter
  // by a column you didn't select, and that column is not projected.
  // -------------------------------------------------------------------------
  it('filters by a non-selected column (id) and projects only the selected column (name)', async () => {
    const rows = await fetchNdjson(
      `column=name&filter=${b64([{ column: 'id', operator: 'eq', value: 1 }])}`
    );

    // id=1 is 'alpha' in the seed
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alpha');

    // The filter column (id) must NOT be projected — only `name` is selected.
    for (const row of rows) {
      expect(Object.keys(row)).toEqual(['name']);
      expect(row).not.toHaveProperty('id');
    }
  }, 120000);
});

// =============================================================================
// BigQuery block — mirrors the Athena block above; gated by BQ creds
// =============================================================================

describeIfBqCredentials('HTTP Data API real-data (live BigQuery)', () => {
  let bqDataMartId: string;

  let bqAdapter: BigQueryApiAdapter;
  let bqConfig: BigQueryConfig;
  let bqFullyQualifiedName: string;

  const BQ_TEST_TABLE_SUFFIX = `http_data_real_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // -------------------------------------------------------------------------
  // beforeAll: seed real BQ table + build credentialed storage + data mart
  // via HTTP API (uses sharedAgent — no second createTestApp() call)
  // -------------------------------------------------------------------------
  beforeAll(async () => {
    const bqCredentials = BigQueryServiceAccountCredentialsSchema.parse(
      JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
    );

    bqConfig = {
      projectId: BQ_PROJECT_ID!,
      location: BIGQUERY_AUTODETECT_LOCATION,
    };

    bqAdapter = new BigQueryApiAdapter(bqCredentials, bqConfig);

    bqFullyQualifiedName = `${BQ_PROJECT_ID}.${BQ_DATASET}.${BQ_TEST_TABLE_SUFFIX}`;

    // --- Step 1: Pre-cleanup in case a previous run crashed ---
    try {
      await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqFullyQualifiedName}\``);
    } catch {
      // Ignore errors during pre-cleanup
    }

    // --- Step 2: Seed real BQ table ---
    await bqAdapter.executeQuery(
      `CREATE TABLE \`${bqFullyQualifiedName}\` (id INT64, name STRING, active BOOL, created_at TIMESTAMP)`
    );

    await bqAdapter.executeQuery(
      `INSERT INTO \`${bqFullyQualifiedName}\` (id, name, active, created_at) VALUES
        (1, 'alpha',    true,  TIMESTAMP '2024-01-01 00:00:00'),
        (2, 'beta',     false, TIMESTAMP '2024-02-01 00:00:00'),
        (3, 'gamma',    true,  TIMESTAMP '2024-03-01 00:00:00'),
        (4, 'alphabet', true,  TIMESTAMP '2024-04-01 00:00:00')`
    );

    // --- Step 3: Create credentialed BQ storage via HTTP API ---
    const storageCreateRes = await sharedAgent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({ type: 'GOOGLE_BIGQUERY' });
    if (storageCreateRes.status !== 201) {
      console.error('BQ storage create failed:', JSON.stringify(storageCreateRes.body, null, 2));
    }
    expect(storageCreateRes.status).toBe(201);
    const bqStorageId: string = storageCreateRes.body.id;

    const storageUpdateRes = await sharedAgent
      .put(`/api/data-storages/${bqStorageId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'bq-real',
        config: { projectId: BQ_PROJECT_ID! },
        credentials: JSON.parse(BQ_SERVICE_ACCOUNT_KEY!),
      });
    if (storageUpdateRes.status !== 200) {
      console.error('BQ storage update failed:', JSON.stringify(storageUpdateRes.body, null, 2));
    }
    expect(storageUpdateRes.status).toBe(200);

    // --- Step 4: Create data mart ---
    const dataMartCreateRes = await sharedAgent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: 'real-bq-test-mart', storageId: bqStorageId });
    if (dataMartCreateRes.status !== 201) {
      console.error('BQ data mart create failed:', JSON.stringify(dataMartCreateRes.body, null, 2));
    }
    expect(dataMartCreateRes.status).toBe(201);
    bqDataMartId = dataMartCreateRes.body.id;

    // --- Step 5: Set TABLE definition (pointing at the real seeded table) ---
    const defRes = await sharedAgent
      .put(`/api/data-marts/${bqDataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'TABLE',
        definition: { fullyQualifiedName: bqFullyQualifiedName },
      });
    if (defRes.status !== 200) {
      console.error('BQ definition set failed:', JSON.stringify(defRes.body, null, 2));
    }
    expect(defRes.status).toBe(200);

    // --- Step 6: Publish (reads real schema from BigQuery) ---
    const publishRes = await sharedAgent
      .put(`/api/data-marts/${bqDataMartId}/publish`)
      .set(AUTH_HEADER);
    if (publishRes.status !== 200) {
      console.error('BQ publish failed:', JSON.stringify(publishRes.body, null, 2));
    }
    expect(publishRes.status).toBe(200);
  }, 180000);

  // -------------------------------------------------------------------------
  // afterAll: drop BQ table
  // -------------------------------------------------------------------------
  afterAll(async () => {
    try {
      await bqAdapter.executeQuery(`DROP TABLE IF EXISTS \`${bqFullyQualifiedName}\``);
    } catch (error) {
      console.warn('Failed to drop BQ test table during teardown:', error);
    }
  }, 60000);

  // -------------------------------------------------------------------------
  // Helpers scoped to BQ block
  // -------------------------------------------------------------------------
  async function fetchBqNdjson(qs: string): Promise<Record<string, unknown>[]> {
    const res = await sharedAgent
      .get(`/api/external/http-data/data-marts/${bqDataMartId}.ndjson${qs ? '?' + qs : ''}`)
      .set(AUTH_HEADER);
    if (res.status !== 200) {
      console.error('fetchBqNdjson failed:', res.status, JSON.stringify(res.body, null, 2));
      console.error('Response text:', res.text?.slice(0, 500));
    }
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    return res.text
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  }

  const bqB64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

  // -------------------------------------------------------------------------
  // Test A — WITHOUT output controls (streams all real rows)
  // -------------------------------------------------------------------------
  it('streams all real rows from BigQuery without output controls', async () => {
    const rows = await fetchBqNdjson('column=id&column=name&column=active');
    expect(rows).toHaveLength(4);

    // BQ may return id as number — coerce to string for safe lookup
    const byId = Object.fromEntries(rows.map(r => [String(r.id), r]));
    expect(byId['1'].name).toBe('alpha');
    expect(byId['2'].name).toBe('beta');
    expect(byId['4'].name).toBe('alphabet');
  }, 120000);

  // -------------------------------------------------------------------------
  // Test B — WITH output controls (filter/sort/limit on real BQ data)
  // -------------------------------------------------------------------------
  it('applies eq filter on real BigQuery data', async () => {
    const rows = await fetchBqNdjson(
      `column=id&column=name&filter=${bqB64([{ column: 'name', operator: 'eq', value: 'alpha' }])}`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alpha');
  }, 120000);

  it('applies contains + sort desc + limit on real BigQuery data', async () => {
    // Both 'alpha' (id=1) and 'alphabet' (id=4) contain 'alpha'
    // sort desc by id + limit 1 → should yield id=4 ('alphabet')
    const rows = await fetchBqNdjson(
      `column=id&column=name` +
        `&filter=${bqB64([{ column: 'name', operator: 'contains', value: 'alpha' }])}` +
        `&sort=${bqB64([{ column: 'id', direction: 'desc' }])}` +
        `&limit=1`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alphabet');
  }, 120000);

  it('applies a numeric between filter on real BigQuery data', async () => {
    const rows = await fetchBqNdjson(
      `column=id&column=name` +
        `&filter=${bqB64([{ column: 'id', operator: 'between', value: { from: 2, to: 3 } }])}` +
        `&sort=${bqB64([{ column: 'id', direction: 'asc' }])}`
    );
    // BQ returns id as number — coerce to Number for comparison
    expect(rows.map(r => Number(r.id))).toEqual([2, 3]);
  }, 120000);
});

// =============================================================================
// Scenario #3 — SQL-defined data mart + output controls (real CreateView path)
//
// Unlike the TABLE-def block above, this uses a SQL definition so output
// controls exercise the real CreateViewService -> creates a real view in
// Athena (CREATE OR REPLACE VIEW view_<dataMartId>), then filters against it.
// =============================================================================

describeIfCredentials('HTTP Data API — real Athena SQL-def + output controls (CreateView)', () => {
  let sqlDataMartId: string;

  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let credentials: AthenaCredentials;
  let config: AthenaConfig;
  let database: string;

  const TEST_TABLE_SUFFIX = `http_data_real_sql_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const TEST_S3_PREFIX = `integration-test/${TEST_TABLE_SUFFIX}/`;

  // view name CreateViewService computes is `view_<dataMartId with - -> _>`,
  // created in the Athena default database (no DB context is set on the DDL).
  const computeViewName = (id: string) => `view_${id.replace(/-/g, '_')}`;

  beforeAll(async () => {
    credentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };
    config = {
      region: ATHENA_REGION!,
      outputBucket: ATHENA_OUTPUT_BUCKET!,
    };
    adapter = new AthenaApiAdapter(credentials, config);
    s3Adapter = new S3ApiAdapter(credentials, config);
    database = ATHENA_DATABASE!;

    // --- Pre-cleanup ---
    try {
      const { queryExecutionId: dropId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${TEST_S3_PREFIX}cleanup/`
      );
      await adapter.waitForQueryToComplete(dropId);
    } catch {
      // Ignore errors during pre-cleanup
    }

    // --- Seed real Athena table (referenced by the SQL definition) ---
    const ctasQuery = `CREATE TABLE "${database}"."${TEST_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${TEST_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (1, 'alpha',    true),
  (2, 'beta',     false),
  (3, 'gamma',    true)
) AS t (id, name, active)`;
    const { queryExecutionId } = await adapter.executeQuery(
      ctasQuery,
      config.outputBucket,
      `${TEST_S3_PREFIX}ctas/`
    );
    await adapter.waitForQueryToComplete(queryExecutionId);

    // --- Create credentialed Athena storage via HTTP API ---
    const storageCreateRes = await sharedAgent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({ type: 'AWS_ATHENA' });
    expect(storageCreateRes.status).toBe(201);
    const storageId: string = storageCreateRes.body.id;

    const storageUpdateRes = await sharedAgent
      .put(`/api/data-storages/${storageId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'athena-real-sql-integration',
        config: { region: ATHENA_REGION!, outputBucket: ATHENA_OUTPUT_BUCKET! },
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID!,
          secretAccessKey: AWS_SECRET_ACCESS_KEY!,
        },
      });
    expect(storageUpdateRes.status).toBe(200);

    // --- Create data mart ---
    const dataMartCreateRes = await sharedAgent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: 'real-athena-sql-mart', storageId });
    expect(dataMartCreateRes.status).toBe(201);
    sqlDataMartId = dataMartCreateRes.body.id;

    // --- Set SQL definition referencing the already-seeded real table ---
    const defRes = await sharedAgent
      .put(`/api/data-marts/${sqlDataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'SQL',
        definition: { sqlQuery: `SELECT * FROM "${database}"."${TEST_TABLE_SUFFIX}"` },
      });
    if (defRes.status !== 200) {
      console.error('SQL definition set failed:', JSON.stringify(defRes.body, null, 2));
    }
    expect(defRes.status).toBe(200);

    // --- Publish ---
    const publishRes = await sharedAgent
      .put(`/api/data-marts/${sqlDataMartId}/publish`)
      .set(AUTH_HEADER);
    if (publishRes.status !== 200) {
      console.error('SQL publish failed:', JSON.stringify(publishRes.body, null, 2));
    }
    expect(publishRes.status).toBe(200);
  }, 180000);

  afterAll(async () => {
    // Drop the view CreateView produced. The DDL is run without a Database
    // context, so the view lands in the Athena `default` database. Try the
    // default-qualified name first, then unqualified as a fallback.
    if (sqlDataMartId) {
      const viewName = computeViewName(sqlDataMartId);
      for (const target of [`"default"."${viewName}"`, `"${viewName}"`]) {
        try {
          const { queryExecutionId } = await adapter.executeQuery(
            `DROP VIEW IF EXISTS ${target}`,
            config.outputBucket,
            `${TEST_S3_PREFIX}drop-view/`
          );
          await adapter.waitForQueryToComplete(queryExecutionId);
          break;
        } catch (error) {
          console.warn(`Failed to drop view ${target} during teardown:`, error);
        }
      }
    }

    try {
      const { queryExecutionId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${TEST_S3_PREFIX}drop/`
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
    } catch (error) {
      console.warn('Failed to drop SQL test table during teardown:', error);
    }

    try {
      // Single scoped sweep of this run's unique root (data, ctas, cleanup, drop,
      // drop-view, query results all live under TEST_S3_PREFIX).
      await s3Adapter.cleanupOutputFiles(config.outputBucket, TEST_S3_PREFIX);
    } catch (error) {
      console.warn('Failed to clean up S3 output files:', error);
    }
  }, 90000);

  async function fetchSqlNdjson(qs: string): Promise<Record<string, unknown>[]> {
    const res = await sharedAgent
      .get(`/api/external/http-data/data-marts/${sqlDataMartId}.ndjson${qs ? '?' + qs : ''}`)
      .set(AUTH_HEADER);
    if (res.status !== 200) {
      console.error('fetchSqlNdjson failed:', res.status, JSON.stringify(res.body, null, 2));
      console.error('Response text:', res.text?.slice(0, 500));
    }
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    return res.text
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  }

  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

  it('applies output controls on a SQL-def mart via real CreateView on live Athena', async () => {
    // Output controls present -> composer resolves the SQL mart to a real view
    // (CreateViewService creates it in Athena), then filters against that view.
    const rows = await fetchSqlNdjson(
      `column=id&column=name&filter=${b64([{ column: 'name', operator: 'eq', value: 'alpha' }])}`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('alpha');
    expect(String(rows[0].id)).toBe('1');
  }, 180000);
});

// =============================================================================
// Scenario #11 — multi-batch streaming with output controls
//
// Seed a table with MORE than STREAM_BATCH_SIZE rows so a filtered result set
// still spans MULTIPLE read batches. Assert the streamed NDJSON line count
// equals the expected number of matching rows (proves no truncation at one
// batch) and that ids are unique (no duplicate/missing rows across batches).
// =============================================================================

describeIfCredentials('HTTP Data API — real Athena multi-batch streaming + output controls', () => {
  let bigDataMartId: string;

  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let credentials: AthenaCredentials;
  let config: AthenaConfig;
  let database: string;

  // Seed more than STREAM_BATCH_SIZE rows so the even-parity subset alone
  // (half the rows) still spans multiple batches.
  const TOTAL_ROWS = STREAM_BATCH_SIZE * 2 + 2000; // 12000 when STREAM_BATCH_SIZE=5000
  const EXPECTED_EVEN = Math.floor(TOTAL_ROWS / 2); // 6000

  const TEST_TABLE_SUFFIX = `http_data_real_big_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const TEST_S3_PREFIX = `integration-test/${TEST_TABLE_SUFFIX}/`;

  beforeAll(async () => {
    credentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };
    config = {
      region: ATHENA_REGION!,
      outputBucket: ATHENA_OUTPUT_BUCKET!,
    };
    adapter = new AthenaApiAdapter(credentials, config);
    s3Adapter = new S3ApiAdapter(credentials, config);
    database = ATHENA_DATABASE!;

    // --- Pre-cleanup ---
    try {
      const { queryExecutionId: dropId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${TEST_S3_PREFIX}cleanup/`
      );
      await adapter.waitForQueryToComplete(dropId);
    } catch {
      // Ignore errors during pre-cleanup
    }

    // --- Seed a big table via CTAS using Trino SEQUENCE/UNNEST generator ---
    const ctasQuery = `CREATE TABLE "${database}"."${TEST_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${TEST_S3_PREFIX}data/')
AS SELECT id, CASE WHEN id % 2 = 0 THEN 'even' ELSE 'odd' END AS parity
FROM UNNEST(SEQUENCE(1, ${TOTAL_ROWS})) AS t (id)`;
    const { queryExecutionId } = await adapter.executeQuery(
      ctasQuery,
      config.outputBucket,
      `${TEST_S3_PREFIX}ctas/`
    );
    await adapter.waitForQueryToComplete(queryExecutionId);

    // --- Create credentialed Athena storage via HTTP API ---
    const storageCreateRes = await sharedAgent
      .post('/api/data-storages')
      .set(AUTH_HEADER)
      .send({ type: 'AWS_ATHENA' });
    expect(storageCreateRes.status).toBe(201);
    const storageId: string = storageCreateRes.body.id;

    const storageUpdateRes = await sharedAgent
      .put(`/api/data-storages/${storageId}`)
      .set(AUTH_HEADER)
      .send({
        title: 'athena-real-big-integration',
        config: { region: ATHENA_REGION!, outputBucket: ATHENA_OUTPUT_BUCKET! },
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID!,
          secretAccessKey: AWS_SECRET_ACCESS_KEY!,
        },
      });
    expect(storageUpdateRes.status).toBe(200);

    // --- Create data mart (TABLE def on the big table) ---
    const dataMartCreateRes = await sharedAgent
      .post('/api/data-marts')
      .set(AUTH_HEADER)
      .send({ title: 'real-athena-big-mart', storageId });
    expect(dataMartCreateRes.status).toBe(201);
    bigDataMartId = dataMartCreateRes.body.id;

    const defRes = await sharedAgent
      .put(`/api/data-marts/${bigDataMartId}/definition`)
      .set(AUTH_HEADER)
      .send({
        definitionType: 'TABLE',
        definition: { fullyQualifiedName: `${database}.${TEST_TABLE_SUFFIX}` },
      });
    expect(defRes.status).toBe(200);

    const publishRes = await sharedAgent
      .put(`/api/data-marts/${bigDataMartId}/publish`)
      .set(AUTH_HEADER);
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
      console.warn('Failed to drop big test table during teardown:', error);
    }

    try {
      // Single scoped sweep of this run's unique root (data, ctas, cleanup, drop,
      // query results all live under TEST_S3_PREFIX).
      await s3Adapter.cleanupOutputFiles(config.outputBucket, TEST_S3_PREFIX);
    } catch (error) {
      console.warn('Failed to clean up S3 output files:', error);
    }
  }, 90000);

  async function fetchBigNdjson(qs: string): Promise<Record<string, unknown>[]> {
    const res = await sharedAgent
      .get(`/api/external/http-data/data-marts/${bigDataMartId}.ndjson${qs ? '?' + qs : ''}`)
      .set(AUTH_HEADER);
    if (res.status !== 200) {
      console.error('fetchBigNdjson failed:', res.status, JSON.stringify(res.body, null, 2));
      console.error('Response text:', res.text?.slice(0, 500));
    }
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-ndjson');
    return res.text
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  }

  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');

  it('streams the full filtered set across multiple batches with output controls', async () => {
    // Filter to even parity (half the rows). EXPECTED_EVEN > STREAM_BATCH_SIZE,
    // so the result must be assembled from several read batches.
    expect(EXPECTED_EVEN).toBeGreaterThan(STREAM_BATCH_SIZE);

    const rows = await fetchBigNdjson(
      `column=id&column=parity&filter=${b64([{ column: 'parity', operator: 'eq', value: 'even' }])}`
    );

    // Full filtered set returned, not truncated at one batch.
    expect(rows).toHaveLength(EXPECTED_EVEN);

    // Every returned row is actually even parity.
    expect(rows.every(r => r.parity === 'even')).toBe(true);

    // No duplicate / missing ids across batches: unique id count == row count,
    // and every id is even.
    const ids = rows.map(r => Number(r.id));
    expect(new Set(ids).size).toBe(EXPECTED_EVEN);
    expect(ids.every(id => id % 2 === 0)).toBe(true);
  }, 180000);
});
