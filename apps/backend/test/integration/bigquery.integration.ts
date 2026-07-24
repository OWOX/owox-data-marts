import { BigQueryApiAdapter } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api.adapter';
import { BigQueryServiceAccountCredentialsSchema } from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import {
  BigQueryConfig,
  BIGQUERY_AUTODETECT_LOCATION,
} from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema';
import { BigQueryApiAdapterFactory } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryDataMartSchemaProvider } from 'src/data-marts/data-storage-types/bigquery/services/bigquery-data-mart-schema.provider';
import { BigQueryClauseRenderer } from 'src/data-marts/data-storage-types/bigquery/services/bigquery-clause-renderer';
import { BigQueryQueryBuilder } from 'src/data-marts/data-storage-types/bigquery/services/bigquery-query.builder';
import { BigQueryBlendedQueryBuilder } from 'src/data-marts/data-storage-types/bigquery/services/bigquery-blended-query-builder';
import { BlendedQueryContext } from 'src/data-marts/data-storage-types/interfaces/blended-query-builder.interface';
import { DataMartRelationship } from 'src/data-marts/entities/data-mart-relationship.entity';
import { DataStorageCredentialsResolver } from 'src/data-marts/data-storage-types/data-storage-credentials-resolver.service';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';
import { buildBlendedFieldIndex } from 'src/data-marts/services/blended-field-index';

/**
 * BigQuery Integration Tests
 *
 * These tests validate that BigQuery adapter code works with real cloud credentials.
 * They catch SDK version issues, permission problems, and query dialect bugs
 * that in-memory tests cannot detect.
 *
 * Required environment variables:
 *   BQ_SERVICE_ACCOUNT_KEY - JSON string of a GCP service account key
 *   BQ_PROJECT_ID          - GCP project ID
 *   BQ_DATASET             - BigQuery dataset name (must already exist)
 */

const BQ_SERVICE_ACCOUNT_KEY = process.env.BQ_SERVICE_ACCOUNT_KEY;
const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID;
const BQ_DATASET = process.env.BQ_DATASET;

const BQ_CREDENTIALS_AVAILABLE = !!(BQ_SERVICE_ACCOUNT_KEY && BQ_PROJECT_ID && BQ_DATASET);

if (!BQ_CREDENTIALS_AVAILABLE) {
  console.log(
    'Skipping BigQuery integration tests: BQ_SERVICE_ACCOUNT_KEY, BQ_PROJECT_ID, or BQ_DATASET not set'
  );
}

const describeIfCredentials = BQ_CREDENTIALS_AVAILABLE ? describe : describe.skip;

describeIfCredentials('BigQuery Integration Tests', () => {
  let adapter: BigQueryApiAdapter;
  let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
  let config: BigQueryConfig;
  let testTableName: string;
  let fullyQualifiedName: string;

  beforeAll(async () => {
    credentials = BigQueryServiceAccountCredentialsSchema.parse(
      JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
    );

    config = {
      projectId: BQ_PROJECT_ID!,
      location: BIGQUERY_AUTODETECT_LOCATION,
    };

    adapter = new BigQueryApiAdapter(credentials, config);

    testTableName = `integration_test_${Date.now()}`;
    fullyQualifiedName = `${BQ_PROJECT_ID}.${BQ_DATASET}.${testTableName}`;

    await adapter.executeQuery(
      `CREATE TABLE \`${fullyQualifiedName}\` (
        id INT64,
        name STRING,
        active BOOL,
        created_at TIMESTAMP,
        amount NUMERIC
      )`
    );

    await adapter.executeQuery(
      `INSERT INTO \`${fullyQualifiedName}\` (id, name, active, created_at, amount) VALUES
        (1, 'alpha',    true,  TIMESTAMP '2024-01-01 00:00:00', 10.5),
        (2, 'beta',     false, TIMESTAMP '2024-02-01 00:00:00', 20.0),
        (3, 'gamma',    true,  TIMESTAMP '2024-03-01 00:00:00', 30.0),
        (4, 'alphabet', true,  TIMESTAMP '2024-04-01 00:00:00', 40.0)`
    );
  }, 120000);

  afterAll(async () => {
    try {
      await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fullyQualifiedName}\``);
    } catch (error) {
      console.warn('Failed to drop test table during teardown:', error);
    }
  }, 30000);

  describe('Access Validation', () => {
    it('should accept valid credentials', async () => {
      await expect(adapter.checkAccess()).resolves.not.toThrow();
    }, 30000);

    it('should reject invalid credentials', async () => {
      const invalidCredentials = {
        ...credentials,
        private_key: 'invalid-key',
      };

      const invalidAdapter = new BigQueryApiAdapter(
        invalidCredentials as typeof credentials,
        config
      );

      await expect(invalidAdapter.checkAccess()).rejects.toThrow();
    }, 30000);
  });

  describe('SQL Dry Run', () => {
    it('should validate correct query syntax', async () => {
      const result = await adapter.executeDryRunQuery(`SELECT * FROM \`${fullyQualifiedName}\``);
      expect(result.totalBytesProcessed).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should reject invalid SQL syntax', async () => {
      await expect(adapter.executeDryRunQuery('SELEKT * FORM invalid')).rejects.toThrow();
    }, 30000);

    it('should reject query on non-existent table', async () => {
      await expect(
        adapter.executeDryRunQuery(
          `SELECT * FROM \`${BQ_PROJECT_ID}.${BQ_DATASET}.nonexistent_table_xxx\``
        )
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Schema Actualization', () => {
    it('should read real table schema with correct field names and types', async () => {
      const queryBuilder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());
      const adapterFactory = new BigQueryApiAdapterFactory({} as DataStorageCredentialsResolver);
      const schemaProvider = new BigQueryDataMartSchemaProvider(adapterFactory, queryBuilder);

      const definition: TableDefinition = {
        fullyQualifiedName,
      };

      const result = await schemaProvider.getActualDataMartSchema(definition, config, credentials);

      expect(result.type).toBe('bigquery-data-mart-schema');
      expect(result.fields).toHaveLength(5);

      const fieldNames = result.fields.map((f: { name: string }) => f.name);
      expect(fieldNames).toEqual(['id', 'name', 'active', 'created_at', 'amount']);

      for (const field of result.fields) {
        expect(typeof (field as { type: string }).type).toBe('string');
        expect((field as { type: string }).type.length).toBeGreaterThan(0);
      }
    }, 30000);
  });

  // Regression net for the `executeQuery` rewrite (createQueryJob + job-status
  // polling instead of `bigQuery.query()`). These run against real BigQuery
  // and lock the two contracts the rewrite changed:
  //   1. executeQuery waits for the job to finish, then its jobId resolves to
  //      a materialized anonymous destination table that streams rows — the
  //      exact path the report reader and the SQL-run executor depend on.
  //   2. an invalid query still surfaces as a thrown error (previously thrown
  //      by `bigQuery.query()`, now from the job's error status).
  // The DDL path (CREATE/DROP) is already exercised by beforeAll/afterAll.
  describe('Query Execution (executeQuery → job → destination table)', () => {
    it('runs a SELECT as a job and streams rows from the destination table', async () => {
      const { jobId } = await adapter.executeQuery(
        `SELECT n, label FROM UNNEST([
          STRUCT(1 AS n, 'a' AS label),
          STRUCT(2 AS n, 'b' AS label)
        ]) ORDER BY n`
      );
      expect(jobId).toBeTruthy();

      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      expect(destinationTable).toBeDefined();

      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });

      expect(rows).toHaveLength(2);
      expect(rows.map((r: Record<string, unknown>) => String(r.label))).toEqual(['a', 'b']);
      expect(rows.map((r: Record<string, unknown>) => Number(r.n))).toEqual([1, 2]);
    }, 60000);

    it('supports NAMED query parameters end-to-end', async () => {
      const { jobId } = await adapter.executeQuery('SELECT @n AS n', [{ name: 'n', value: 42 }]);

      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 10, autoPaginate: false });

      expect(rows).toHaveLength(1);
      expect(Number((rows[0] as Record<string, unknown>).n)).toBe(42);
    }, 60000);

    it('rejects when the query is invalid (error surfaces from job status)', async () => {
      await expect(adapter.executeQuery('SELEKT * FORM nope')).rejects.toThrow();
    }, 60000);
  });

  describe('Output controls (real filtering)', () => {
    const builder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());

    async function runWithOutputControls(
      queryOptions: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
    ): Promise<Record<string, unknown>[]> {
      const definition: TableDefinition = { fullyQualifiedName };
      const built = await builder.buildQuery(definition, queryOptions);
      if (typeof built === 'string')
        throw new Error('expected QueryBuildResult with output controls');
      const { jobId } = await adapter.executeQuery(built.sql, built.params);
      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });
      return rows as Record<string, unknown>[];
    }

    it('eq on a string column filters via named params', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'name', operator: 'eq', value: 'alpha' }],
      });
      expect(rows.map(r => Number(r.id)).sort((a, b) => a - b)).toEqual([1]);
    }, 60000);

    it('contains uses STRPOS and matches substrings', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'name', operator: 'contains', value: 'alpha' }],
      });
      expect(rows.map(r => Number(r.id)).sort((a, b) => a - b)).toEqual([1, 4]);
    }, 60000);

    it('between on a numeric column', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'id', operator: 'between', value: { from: 2, to: 3 } }],
      });
      expect(rows.map(r => Number(r.id)).sort((a, b) => a - b)).toEqual([2, 3]);
    }, 60000);

    it('is_true on a boolean column', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'active', operator: 'is_true' }],
      });
      expect(rows.map(r => Number(r.id)).sort((a, b) => a - b)).toEqual([1, 3, 4]);
    }, 60000);

    it('sort + limit', async () => {
      const rows = await runWithOutputControls({
        sort: [{ column: 'id', direction: 'desc' }],
        limit: 2,
      });
      expect(rows.map(r => Number(r.id))).toEqual([4, 3]);
    }, 60000);

    it('special characters in a string value are bound safely', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'name', operator: 'eq', value: "O'Brien" }],
      });
      expect(rows).toHaveLength(0);
    }, 60000);
  });

  // -------------------------------------------------------------------------
  // Aggregation (real GROUP BY / percentile / date-trunc / totals)
  // -------------------------------------------------------------------------
  // These tests run the aggregation/totals SQL against REAL BigQuery via the
  // exact production read path (executeQuery -> getJob -> destinationTable ->
  // getRows, mirrored from BigQueryReportReaderService).
  //
  // History: these cases originally caught a real bug — the aggregation alias was
  // `<col> (aggregated by <FN>)`, emitted as the FINAL SELECT output column.
  // BigQuery materializes a query job's result into a destination table, so the
  // OUTERMOST column names must be schema-legal, and PARENTHESES are illegal:
  //   Invalid field name "amount (aggregated by SUM)". Fields must contain the
  //   allowed characters ... https://cloud.google.com/bigquery/docs/schemas#column_names
  // (A SPACE alias like `Row Count` IS accepted — BigQuery flexible column names.)
  //
  // Fix: aggregation-labels.ts now emits a parens-free alias `<col> | TOKEN`
  // (the `|` is verified-legal in BQ output column names; consistent with the
  // working `Row Count`, which proved spaces are accepted). These
  // cases therefore EXECUTE on real BigQuery and assert the real values against
  // the 4 seeded rows (amounts 10.5, 20.0, 30.0, 40.0; active true for ids 1,3,4
  // and false for id 2).
  describe('Aggregation (real GROUP BY / percentile / date-trunc / totals)', () => {
    const builder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());

    // Builds via BigQueryQueryBuilder and runs on real BigQuery (production read
    // path). Returns rows on success; throws if BigQuery rejects the query/job.
    async function runWithAggregations(
      queryOptions: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
    ): Promise<Record<string, unknown>[]> {
      const definition: TableDefinition = { fullyQualifiedName };
      const built = await builder.buildQuery(definition, queryOptions);
      if (typeof built === 'string')
        throw new Error('expected QueryBuildResult with output controls');
      const { jobId } = await adapter.executeQuery(built.sql, built.params);
      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });
      return rows as Record<string, unknown>[];
    }

    it('group-by + multi-fn (SUM+AVG) + COUNT_DISTINCT executes and returns the real aggregates', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'amount', 'id'],
        rowCount: true,
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'amount', function: 'AVG' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(2);
      const byActive = new Map(rows.map(r => [Boolean(r.active), r]));

      // active = true → ids 1,3,4 with amounts 10.5 + 30.0 + 40.0
      const active = byActive.get(true)!;
      expect(active).toBeDefined();
      expect(Number(active['amount | SUM'])).toBeCloseTo(80.5, 5);
      expect(Number(active['amount | AVG'])).toBeCloseTo(26.8333, 3);
      expect(Number(active['id | COUNTUNIQUE'])).toBe(3);
      expect(Number(active['Row Count'])).toBe(3);

      // active = false → id 2 with amount 20.0
      const inactive = byActive.get(false)!;
      expect(inactive).toBeDefined();
      expect(Number(inactive['amount | SUM'])).toBeCloseTo(20.0, 5);
      expect(Number(inactive['amount | AVG'])).toBeCloseTo(20.0, 5);
      expect(Number(inactive['id | COUNTUNIQUE'])).toBe(1);
      expect(Number(inactive['Row Count'])).toBe(1);
    }, 60000);

    it('date-trunc MONTH + SUM executes and buckets each row into its own month', async () => {
      const rows = await runWithAggregations({
        columns: ['created_at', 'amount'],
        rowCount: true,
        dateTruncs: [{ column: 'created_at', unit: 'MONTH' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      // Each of the 4 rows is in a distinct month → 4 month buckets.
      expect(rows).toHaveLength(4);

      // The dimension keeps its bare column name; DATE_TRUNC(DATE(col), MONTH)
      // comes back as a BigQueryDate object ({ value: 'YYYY-MM-DD' }) at month start.
      const monthStart = (r: Record<string, unknown>): string =>
        String((r.created_at as { value?: string }).value ?? r.created_at).slice(0, 10);
      const sumByMonth = new Map(rows.map(r => [monthStart(r), Number(r['amount | SUM'])]));
      expect(sumByMonth.get('2024-01-01')).toBeCloseTo(10.5, 5);
      expect(sumByMonth.get('2024-02-01')).toBeCloseTo(20.0, 5);
      expect(sumByMonth.get('2024-03-01')).toBeCloseTo(30.0, 5);
      expect(sumByMonth.get('2024-04-01')).toBeCloseTo(40.0, 5);

      // Row Count is 1 per month (one seeded row each).
      for (const r of rows) {
        expect(Number(r['Row Count'])).toBe(1);
      }
    }, 60000);

    it('percentile P50 via APPROX_QUANTILES executes and returns a value within range', async () => {
      const rows = await runWithAggregations({
        columns: ['amount'],
        aggregations: [{ column: 'amount', function: 'P50' }],
      });

      expect(rows).toHaveLength(1);
      const p50 = Number(rows[0]['amount | MEDIAN']);
      expect(Number.isFinite(p50)).toBe(true);
      // Median of {10.5, 20.0, 30.0, 40.0} lies within [10.5, 40].
      expect(p50).toBeGreaterThanOrEqual(10.5);
      expect(p50).toBeLessThanOrEqual(40);
    }, 60000);

    it('totals shape (metrics-only, no GROUP BY) executes and returns one totals row', async () => {
      const rows = await runWithAggregations({
        columns: ['amount', 'id'],
        rowCount: true,
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row['amount | SUM'])).toBeCloseTo(100.5, 5);
      expect(Number(row['id | COUNTUNIQUE'])).toBe(4);
      expect(Number(row['Row Count'])).toBe(4);
    }, 60000);

    it('date-trunc MONTH with a timeZone executes (the tz date-trunc SQL now runs on real BQ)', async () => {
      const rows = await runWithAggregations({
        columns: ['created_at', 'amount'],
        dateTruncs: [{ column: 'created_at', unit: 'MONTH', timeZone: 'America/New_York' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      // The tz form is now reachable: it must execute and return 4 month buckets
      // with finite SUMs (the seeded timestamps are at midnight UTC).
      expect(rows).toHaveLength(4);
      for (const r of rows) {
        expect(Number.isFinite(Number(r['amount | SUM']))).toBe(true);
      }
    }, 60000);

    // Case 1 — MIN / MAX / plain COUNT alongside one group-by key.
    it('MIN / MAX / COUNT (group by active) execute and return the real extrema/counts', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'amount'],
        aggregations: [
          { column: 'amount', function: 'MIN' },
          { column: 'amount', function: 'MAX' },
          { column: 'amount', function: 'COUNT' },
        ],
      });

      expect(rows).toHaveLength(2);
      const byActive = new Map(rows.map(r => [Boolean(r.active), r]));

      const active = byActive.get(true)!;
      expect(active).toBeDefined();
      expect(Number(active['amount | MIN'])).toBeCloseTo(10.5, 5);
      expect(Number(active['amount | MAX'])).toBeCloseTo(40, 5);
      expect(Number(active['amount | COUNT'])).toBe(3);

      const inactive = byActive.get(false)!;
      expect(inactive).toBeDefined();
      expect(Number(inactive['amount | MIN'])).toBeCloseTo(20, 5);
      expect(Number(inactive['amount | MAX'])).toBeCloseTo(20, 5);
      expect(Number(inactive['amount | COUNT'])).toBe(1);
    }, 60000);

    // Case 2 — STRING_AGG. BigQuery STRING_AGG(name, ', ') has no guaranteed order
    // without an explicit ORDER BY, so split + sort before comparing.
    it('STRING_AGG (group by active) executes; assert sorted members, not raw order', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'name'],
        aggregations: [{ column: 'name', function: 'STRING_AGG' }],
      });

      expect(rows).toHaveLength(2);
      const byActive = new Map(rows.map(r => [Boolean(r.active), r]));

      const splitSorted = (v: unknown): string[] =>
        String(v)
          .split(', ')
          .map(s => s.trim())
          .sort();

      const active = byActive.get(true)!;
      expect(active).toBeDefined();
      expect(splitSorted(active['name | STRINGAGG'])).toEqual(['alpha', 'alphabet', 'gamma']);

      const inactive = byActive.get(false)!;
      expect(inactive).toBeDefined();
      expect(splitSorted(inactive['name | STRINGAGG'])).toEqual(['beta']);
    }, 60000);

    // Case 3 — all percentiles + monotonicity. APPROX_QUANTILES is approximate, so
    // assert each value is finite, within [10.5, 40], and P25 <= P50 <= P75 <= P95.
    it('all percentiles (P25/P50/P75/P95) execute, stay in range, and are monotonic', async () => {
      const rows = await runWithAggregations({
        columns: ['amount'],
        aggregations: [
          { column: 'amount', function: 'P25' },
          { column: 'amount', function: 'P50' },
          { column: 'amount', function: 'P75' },
          { column: 'amount', function: 'P95' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      const p25 = Number(row['amount | P25']);
      const p50 = Number(row['amount | MEDIAN']);
      const p75 = Number(row['amount | P75']);
      const p95 = Number(row['amount | P95']);

      for (const p of [p25, p50, p75, p95]) {
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(10.5);
        expect(p).toBeLessThanOrEqual(40);
      }
      expect(p25).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p75);
      expect(p75).toBeLessThanOrEqual(p95);
    }, 60000);

    // Case 4 — aggregation respects the WHERE filter (totals-respect-filters guarantee).
    it('grand SUM with active=is_true filter executes; SUM and Row Count cover only matched rows', async () => {
      const rows = await runWithAggregations({
        columns: ['amount'],
        rowCount: true,
        filters: [{ column: 'active', operator: 'is_true' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      // Filtered set ids 1,3,4 → 10.5 + 30 + 40 = 80.5; three matched rows.
      expect(Number(row['amount | SUM'])).toBeCloseTo(80.5, 5);
      expect(Number(row['Row Count'])).toBe(3);
    }, 60000);

    // Case 5 — ORDER BY an aggregated alias + LIMIT. The sort column 'amount' resolves
    // to its output alias `amount | SUM` (a bare aggregate is not in GROUP BY).
    it('ORDER BY aggregated alias (SUM desc) + limit 1 returns only the larger group', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'amount'],
        aggregations: [{ column: 'amount', function: 'SUM' }],
        sort: [{ column: 'amount', direction: 'desc' }],
        limit: 1,
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      // active=true (SUM 80.5) outranks active=false (SUM 20).
      expect(Boolean(row.active)).toBe(true);
      expect(Number(row['amount | SUM'])).toBeCloseTo(80.5, 5);
    }, 60000);

    // Case 6 — multiple group-by dimensions (active AND month bucket).
    it('multi-dimension group-by (active + date-trunc MONTH) executes; 4 groups summing to 100.5', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'created_at', 'amount'],
        dateTruncs: [{ column: 'created_at', unit: 'MONTH' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      // active=true spans 3 distinct months (Jan/Mar/Apr), active=false spans 1 (Feb)
      // → 4 distinct (active, month) groups.
      expect(rows).toHaveLength(4);
      const total = rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);
      expect(total).toBeCloseTo(100.5, 5);
    }, 60000);

    // Case 7 — date-trunc YEAR / QUARTER / WEEK each execute on real BQ.
    it('date-trunc YEAR/QUARTER/WEEK execute with the expected bucket counts and totals', async () => {
      const sumOf = (rows: Record<string, unknown>[]): number =>
        rows.reduce((acc, r) => acc + Number(r['amount | SUM']), 0);

      const yearRows = await runWithAggregations({
        columns: ['created_at', 'amount'],
        dateTruncs: [{ column: 'created_at', unit: 'YEAR' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });
      // All four rows are in 2024 → a single year bucket.
      expect(yearRows).toHaveLength(1);
      expect(sumOf(yearRows)).toBeCloseTo(100.5, 5);

      const quarterRows = await runWithAggregations({
        columns: ['created_at', 'amount'],
        dateTruncs: [{ column: 'created_at', unit: 'QUARTER' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });
      // Jan/Feb/Mar → Q1 (10.5+20+30=60.5), Apr → Q2 (40).
      expect(quarterRows).toHaveLength(2);
      const quarterStart = (r: Record<string, unknown>): string =>
        String((r.created_at as { value?: string }).value ?? r.created_at).slice(0, 10);
      const sumByQuarter = new Map(
        quarterRows.map(r => [quarterStart(r), Number(r['amount | SUM'])])
      );
      expect(sumByQuarter.get('2024-01-01')).toBeCloseTo(60.5, 5);
      expect(sumByQuarter.get('2024-04-01')).toBeCloseTo(40, 5);

      const weekRows = await runWithAggregations({
        columns: ['created_at', 'amount'],
        dateTruncs: [{ column: 'created_at', unit: 'WEEK' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });
      // Exact week bucketing is not asserted (week-start day differs); just that it
      // executes, returns at least one bucket, and the SUMs cover all four rows.
      expect(weekRows.length).toBeGreaterThanOrEqual(1);
      expect(sumOf(weekRows)).toBeCloseTo(100.5, 5);
    }, 120000);

    // Case 8 — totals shape WITH a filter (composeTotals over a filtered set).
    it('totals shape (metrics-only, SUM + COUNT_DISTINCT, no GROUP BY) with active filter executes', async () => {
      const rows = await runWithAggregations({
        columns: ['amount', 'id'],
        rowCount: true,
        filters: [{ column: 'active', operator: 'is_true' }],
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row['amount | SUM'])).toBeCloseTo(80.5, 5);
      expect(Number(row['id | COUNTUNIQUE'])).toBe(3);
      expect(Number(row['Row Count'])).toBe(3);
    }, 60000);

    // Case 9 — empty result. A grand aggregate over the empty set still yields ONE row.
    it('empty-result grand aggregate executes; one row with Row Count 0 and null SUM', async () => {
      const rows = await runWithAggregations({
        columns: ['amount', 'id'],
        rowCount: true,
        filters: [{ column: 'name', operator: 'eq', value: 'definitely-no-match' }],
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      // Grand aggregate over zero matched rows is still a single row.
      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row['Row Count'])).toBe(0);
      expect(Number(row['id | COUNTUNIQUE'])).toBe(0);
      // SUM over no rows is NULL in BigQuery.
      const sum = row['amount | SUM'];
      expect(sum == null || Number(sum) === 0).toBe(true);
    }, 60000);

    // Case 10 — HAVING: a metric filter (rule carries `function`) becomes HAVING and
    // drops whole groups on the server. Seed: active=true SUM=80.5, active=false SUM=20.
    it('HAVING on an aggregated metric filters groups server-side (real BQ)', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'amount'],
        aggregations: [{ column: 'amount', function: 'SUM' }],
        filters: [{ column: 'amount', function: 'SUM', operator: 'gt', value: 50 }],
      });

      // active=true (SUM 80.5) passes the HAVING; active=false (SUM 20) is dropped.
      expect(rows).toHaveLength(1);
      expect(Boolean(rows[0].active)).toBe(true);
      expect(Number(rows[0]['amount | SUM'])).toBeCloseTo(80.5, 5);
    }, 60000);

    // Case 11 — WHERE + HAVING together: WHERE narrows the rows entering the groups,
    // HAVING then filters the surviving groups. active=true rows are 10.5/30/40; keep
    // amount>15 (30,40) → SUM 70; HAVING SUM>50 keeps it.
    it('WHERE (raw rows) and HAVING (groups) combine on real BQ', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'amount'],
        filters: [
          { column: 'amount', operator: 'gt', value: 15 },
          { column: 'amount', function: 'SUM', operator: 'gt', value: 50 },
        ],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      // WHERE amount>15 keeps ids 3,4 (active) = 70 and id 2 (inactive) = 20; HAVING SUM>50
      // keeps only the active group (70).
      expect(rows).toHaveLength(1);
      expect(Boolean(rows[0].active)).toBe(true);
      expect(Number(rows[0]['amount | SUM'])).toBeCloseTo(70, 5);
    }, 60000);

    // Unique Count — Case 1: single PK, grouped by active.
    // Proves uniqueCount alone triggers the aggregated/GROUP BY path.
    // Seed: ids 1,3,4 → active=true; id 2 → active=false.
    it('Unique Count single-PK grouped by active: active=true → 3, active=false → 1', async () => {
      const rows = await runWithAggregations({
        columns: ['active'],
        uniqueCount: true,
        primaryKeyColumns: ['id'],
      });

      expect(rows).toHaveLength(2);
      const byActive = new Map(rows.map(r => [Boolean(r.active), r]));

      const active = byActive.get(true)!;
      expect(active).toBeDefined();
      expect(Number(active['Unique Count'])).toBe(3);

      const inactive = byActive.get(false)!;
      expect(inactive).toBeDefined();
      expect(Number(inactive['Unique Count'])).toBe(1);
    }, 60000);

    // Unique Count — Case 2: single PK, no grouping dimension (grand/totals shape).
    // One grand row with Unique Count = 4 (all distinct ids).
    it('Unique Count single-PK grand (no grouping): one row with Unique Count = 4', async () => {
      const rows = await runWithAggregations({
        uniqueCount: true,
        primaryKeyColumns: ['id'],
      });

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['Unique Count'])).toBe(4);
    }, 60000);
  });
});

// ---------------------------------------------------------------------------
// Operator-matrix + relative_date + wildcard-literal safety (separate seed)
// ---------------------------------------------------------------------------
// Uses its OWN table (matrixTableName) and beforeAll/afterAll so that the
// 4-row assertions in the suite above remain untouched.

describeIfCredentials('Output controls — operator matrix & dates (real BigQuery)', () => {
  let adapter: BigQueryApiAdapter;
  let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
  let config: BigQueryConfig;
  let matrixTableName: string;
  let matrixFQN: string;

  const builder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());

  // Builds SQL+params and runs on real BigQuery, returning row objects.
  async function runMatrix(
    queryOptions: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
  ): Promise<Record<string, unknown>[]> {
    const definition: TableDefinition = { fullyQualifiedName: matrixFQN };
    const built = await builder.buildQuery(definition, queryOptions);
    if (typeof built === 'string')
      throw new Error('expected QueryBuildResult with output controls');
    const { jobId } = await adapter.executeQuery(built.sql, built.params);
    const job = await adapter.getJob(jobId);
    const destinationTable = job.metadata.configuration.query.destinationTable;
    const table = adapter.createTableReference(
      destinationTable.projectId,
      destinationTable.datasetId,
      destinationTable.tableId
    );
    const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });
    return rows as Record<string, unknown>[];
  }

  // Sort row ids numerically for deterministic assertions.
  function ids(rows: Record<string, unknown>[]): number[] {
    return rows.map(r => Number(r.id)).sort((a, b) => a - b);
  }

  beforeAll(async () => {
    credentials = BigQueryServiceAccountCredentialsSchema.parse(
      JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
    );
    config = {
      projectId: BQ_PROJECT_ID!,
      location: BIGQUERY_AUTODETECT_LOCATION,
    };
    adapter = new BigQueryApiAdapter(credentials, config);

    matrixTableName = `op_matrix_test_${Date.now()}`;
    matrixFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.${matrixTableName}`;

    await adapter.executeQuery(
      `CREATE TABLE \`${matrixFQN}\` (
        id INT64,
        name STRING,
        tag STRING,
        score INT64,
        active BOOL,
        created_at DATE,
        created_ts TIMESTAMP
      )`
    );

    // Seed rows (id, name, tag, score, active, created_at)
    //   1  alpha    a      10  true   today
    //   2  beta     b      20  false  40 days ago
    //   3  gamma    c      30  true   ~400 days ago (last year)
    //   4  alphabet a%b    40  true   5 days ago
    //   5  ALPHA    a_b    50  false  today
    //   6  (empty)  x       0  true   mid last year (anchored: Jul 1 of last year)
    //   7  future   f      70  true   ~13 months from now (next calendar year)
    //   8  NULL     NULL  NULL NULL   NULL / NULL  (all-NULL row — proves negative
    //                    operators keep NULLs: neq/not_contains/not_regex include it,
    //                    is_null returns it, comparison/affix/regex/date filters drop it)
    //
    // Row-date expressions are anchored to the calendar year (not sliding day
    // offsets near a boundary) so relative_date assertions hold whenever the suite
    // runs. Row 6 uses DATE_TRUNC(...,YEAR) - 6 months so it stays firmly in last
    // year all year round; a plain "-200 days" drifts into this_year past ~Jul 20.
    // created_ts mirrors created_at as a TIMESTAMP at 13:00 (NOT midnight) for the
    // "today" rows, so relative_date exercises the DATE(col) wrapper on a sub-day
    // value — without it BigQuery raises "No matching signature for =" (TIMESTAMP vs DATE).
    // Row 7 is future-dated to prove the this_year / this_month UPPER BOUND excludes it.
    await adapter.executeQuery(
      `INSERT INTO \`${matrixFQN}\` (id, name, tag, score, active, created_at, created_ts) VALUES
        (1, 'alpha',    'a',    10,  true,  CURRENT_DATE(),                                TIMESTAMP_ADD(TIMESTAMP(CURRENT_DATE()), INTERVAL 13 HOUR)),
        (2, 'beta',     'b',    20,  false, DATE_SUB(CURRENT_DATE(), INTERVAL 40 DAY),     TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 40 DAY))),
        (3, 'gamma',    'c',    30,  true,  DATE_SUB(CURRENT_DATE(), INTERVAL 400 DAY),    TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 400 DAY))),
        (4, 'alphabet', 'a%b',  40,  true,  DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY),      TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 5 DAY))),
        (5, 'ALPHA',    'a_b',  50,  false, CURRENT_DATE(),                                TIMESTAMP_ADD(TIMESTAMP(CURRENT_DATE()), INTERVAL 13 HOUR)),
        (6, '',         'x',     0,  true,  DATE_SUB(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 6 MONTH),  TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(), YEAR), INTERVAL 6 MONTH))),
        (7, 'future',   'f',    70,  true,  DATE_ADD(CURRENT_DATE(), INTERVAL 13 MONTH),   TIMESTAMP(DATE_ADD(CURRENT_DATE(), INTERVAL 13 MONTH))),
        (8, NULL,       NULL,   NULL, NULL, NULL,                                          NULL)`
    );
  }, 120000);

  afterAll(async () => {
    try {
      await adapter.executeQuery(`DROP TABLE IF EXISTS \`${matrixFQN}\``);
    } catch (error) {
      console.warn('Failed to drop matrix test table:', error);
    }
  }, 30000);

  // --- Scalar operators on score ---

  it('neq: score != 20 → rows 1,3,4,5,6,7,8 (null-inclusive: NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'neq', value: 20 }],
    });
    expect(ids(rows)).toEqual([1, 3, 4, 5, 6, 7, 8]);
  }, 60000);

  it('gt: score > 30 → rows 4,5,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'gt', value: 30 }],
    });
    expect(ids(rows)).toEqual([4, 5, 7]);
  }, 60000);

  it('lt: score < 30 → rows 1,2,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'lt', value: 30 }],
    });
    expect(ids(rows)).toEqual([1, 2, 6]);
  }, 60000);

  it('gte: score >= 30 → rows 3,4,5,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'gte', value: 30 }],
    });
    expect(ids(rows)).toEqual([3, 4, 5, 7]);
  }, 60000);

  it('lte: score <= 30 → rows 1,2,3,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'lte', value: 30 }],
    });
    expect(ids(rows)).toEqual([1, 2, 3, 6]);
  }, 60000);

  // --- Substring / affix operators on name ---

  it('not_contains: name not contains "alpha" → rows 2,3,5,6,7,8 (case-sensitive; ALPHA excluded; NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_contains', value: 'alpha' }],
    });
    expect(ids(rows)).toEqual([2, 3, 5, 6, 7, 8]);
  }, 60000);

  it('starts_with: name starts with "alpha" → rows 1,4', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'starts_with', value: 'alpha' }],
    });
    expect(ids(rows)).toEqual([1, 4]);
  }, 60000);

  it('ends_with: name ends with "a" → rows 1,2,3 (alpha/beta/gamma all end in "a")', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'ends_with', value: 'a' }],
    });
    expect(ids(rows)).toEqual([1, 2, 3]);
  }, 60000);

  // --- Wildcard-literal safety on tag column ---
  // tag='a%b' is row 4; tag='a_b' is row 5.
  // BigQuery uses STRPOS / STARTS_WITH / ENDS_WITH — no LIKE wildcards.

  it('SAFETY contains "a%b" on tag → only row 4 (% is literal, not wildcard)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'contains', value: 'a%b' }],
    });
    expect(ids(rows)).toEqual([4]);
  }, 60000);

  it('SAFETY contains "a_b" on tag → only row 5 (_ is literal, not wildcard)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'contains', value: 'a_b' }],
    });
    expect(ids(rows)).toEqual([5]);
  }, 60000);

  it('SAFETY starts_with "a%b" on tag → only row 4', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'starts_with', value: 'a%b' }],
    });
    expect(ids(rows)).toEqual([4]);
  }, 60000);

  it('SAFETY ends_with "a_b" on tag → only row 5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'ends_with', value: 'a_b' }],
    });
    expect(ids(rows)).toEqual([5]);
  }, 60000);

  // --- Regex operators on name ---
  // BigQuery REGEXP_CONTAINS uses RE2 — case-sensitive by default.
  // '^alpha' matches 'alpha' (row 1) and 'alphabet' (row 4), NOT 'ALPHA' (row 5).

  it('regex: name matches "^alpha" → rows 1,4 (case-sensitive)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'regex', value: '^alpha' }],
    });
    expect(ids(rows)).toEqual([1, 4]);
  }, 60000);

  it('not_regex: name not matching "^alpha" → rows 2,3,5,6,7,8 (null-inclusive: NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_regex', value: '^alpha' }],
    });
    expect(ids(rows)).toEqual([2, 3, 5, 6, 7, 8]);
  }, 60000);

  // --- No-value operators ---

  it('is_empty on name → rows 6,8 (empty string + NULL; is_empty is null-inclusive)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_empty' }],
    });
    expect(ids(rows)).toEqual([6, 8]);
  }, 60000);

  it('is_not_empty on name → rows 1,2,3,4,5,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_not_empty' }],
    });
    expect(ids(rows)).toEqual([1, 2, 3, 4, 5, 7]);
  }, 60000);

  it('is_null on name → row 8 (the NULL-seeded row)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_null' }],
    });
    expect(ids(rows)).toEqual([8]);
  }, 60000);

  it('is_not_null on name → all 7 rows', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_not_null' }],
    });
    expect(ids(rows)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  }, 60000);

  it('is_true on active → rows 1,3,4,6,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'active', operator: 'is_true' }],
    });
    expect(ids(rows)).toEqual([1, 3, 4, 6, 7]);
  }, 60000);

  it('is_false on active → rows 2,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'active', operator: 'is_false' }],
    });
    expect(ids(rows)).toEqual([2, 5]);
  }, 60000);

  // --- relative_date on created_at (DATE column) ---
  // Row dates (relative to test run date):
  //   1 → today            5 → today
  //   4 → -5 days          2 → -40 days
  //   6 → mid last year    3 → -400 days
  //
  // today    → rows dated CURRENT_DATE() → [1, 5]
  // last_n_days(7) → >= CURRENT_DATE - 7 days → [1, 4, 5]
  // last_n_months(3) → -40 days (~1.3 months) included → [1, 2, 4, 5]
  // this_year → whole calendar year: today rows (1,5) in, other-year rows
  //   (3 & 6 last year, 7 next year) out. Recent rows 2 & 4 are NOT asserted for
  //   this_year — they legitimately leave it in early January (see the calendar
  //   invariants in relative-date-seed-invariants.spec.ts).

  it('relative_date today on created_at → rows 1,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_at', operator: 'relative_date', value: { kind: 'today' } }],
    });
    expect(ids(rows)).toEqual([1, 5]);
  }, 60000);

  // Regression guard: on a TIMESTAMP column `col = CURRENT_DATE()` is a hard type
  // error in BigQuery. The DATE(col) wrapper compares the date part, so the today
  // rows (stamped at 13:00) match without error.
  it('relative_date today on a TIMESTAMP column → rows 1,5 (DATE(col) wrapper)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_ts', operator: 'relative_date', value: { kind: 'today' } }],
      columnTypes: new Map([['created_ts', 'TIMESTAMP']]),
    });
    expect(ids(rows)).toEqual([1, 5]);
  }, 60000);

  // Regression guard: a date filter value binds as STRING, so `ts_col = @p` errors.
  // The CAST(@p AS TIMESTAMP) wrapper parses the string to the column type and runs.
  it('value filter on a TIMESTAMP column runs via CAST(@p AS TIMESTAMP) → all rows >= 2024-01-01', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_ts', operator: 'gte', value: '2024-01-01' }],
      columnTypes: new Map([['created_ts', 'TIMESTAMP']]),
    });
    // All 7 seeded rows (including future row 7) are >= 2024-01-01.
    expect(ids(rows)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  }, 60000);

  it('relative_date last_n_days(7) on created_at → rows 1,4,5 (upper bound excludes future row 7)', async () => {
    const rows = await runMatrix({
      filters: [
        { column: 'created_at', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
      ],
    });
    // Bounded `<= CURRENT_DATE()`: future row 7 (+13 months) is excluded.
    expect(ids(rows)).not.toContain(7);
    expect(ids(rows)).toEqual([1, 4, 5]);
  }, 60000);

  it('relative_date this_year on created_at → current-year rows in, other-year rows out', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_at', operator: 'relative_date', value: { kind: 'this_year' } }],
    });
    const got = ids(rows);
    // today rows are always in the current calendar year
    expect(got).toContain(1);
    expect(got).toContain(5);
    // other-year rows must never appear: rows 3 (-400d) & 6 (mid last year) are last
    // year; row 7 (+13m) is next year — the this_year UPPER BOUND excludes it.
    expect(got).not.toContain(3);
    expect(got).not.toContain(6);
    expect(got).not.toContain(7);
  }, 60000);

  it('relative_date last_n_months(3) on created_at → rows 1,2,4,5 (upper bound excludes future row 7)', async () => {
    const rows = await runMatrix({
      filters: [
        {
          column: 'created_at',
          operator: 'relative_date',
          value: { kind: 'last_n_months', n: 3 },
        },
      ],
    });
    // Bounded `<= CURRENT_DATE()`: future row 7 (+13 months) is excluded.
    expect(ids(rows)).not.toContain(7);
    expect(ids(rows)).toEqual([1, 2, 4, 5]);
  }, 60000);

  // --- Adversarial / safety ---

  it('ADVERSARIAL eq name "O\'Brien" → 0 rows, no error (single-quote binding)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'eq', value: "O'Brien" }],
    });
    expect(rows).toHaveLength(0);
  }, 60000);
});

// ---------------------------------------------------------------------------
// Blended pre-join SLICE — mirror of the Athena suite on REAL BigQuery.
// Proves a pre-join filter narrows a JOINED data mart inside its `<alias>_raw`
// CTE before the JOIN. Uses its OWN two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed:
//   orders(order_id, user_id, amount): (1,10,100) (2,20,200) (3,10,300) (4,30,400)
//   users(user_id, role, country):     (10,'admin','US') (20,'viewer','US') (30,'admin','DE')
//
// Subsidiaries are LEFT JOINed, so a slice alone narrows the users_raw CTE and
// NULLs out unmatched home rows; a post-join `role IS NOT NULL` eliminates them.

describeIfCredentials(
  'Blended pre-join slice narrows joined mart in *_raw CTE (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let ordersFQN: string;
    let usersFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function usersRelationship(): DataMartRelationship {
      return {
        id: 'rel-users',
        targetAlias: 'users',
        joinConditions: [{ sourceFieldName: 'user_id', targetFieldName: 'user_id' }],
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    function blendContext(over: Partial<BlendedQueryContext> = {}): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'users__role', aliasPath: 'users', originalFieldName: 'role', type: 'STRING' },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      return {
        mainTableReference: `\`${ordersFQN}\``,
        mainDataMartTitle: 'Orders',
        mainDataMartUrl: 'http://x/orders',
        chains: [
          {
            relationship: usersRelationship(),
            targetTableReference: `\`${usersFQN}\``,
            parentAlias: 'main',
            cteName: 'users',
            blendedFields: [
              {
                targetFieldName: 'role',
                outputAlias: 'role',
                isHidden: false,
                aggregateFunction: 'MAX',
              },
            ],
            targetDataMartTitle: 'Users',
            targetDataMartUrl: 'http://x/users',
          },
        ],
        columns: ['order_id', 'role'],
        fieldIndex,
        ...over,
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { jobId } = await adapter.executeQuery(sql, params);
      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });
      return rows as Record<string, unknown>[];
    }

    function ids(rows: Record<string, unknown>[]): number[] {
      return rows.map(r => Number(r.order_id)).sort((a, b) => a - b);
    }

    beforeAll(async () => {
      credentials = BigQueryServiceAccountCredentialsSchema.parse(
        JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
      );
      config = {
        projectId: BQ_PROJECT_ID!,
        location: BIGQUERY_AUTODETECT_LOCATION,
      };
      adapter = new BigQueryApiAdapter(credentials, config);

      const stamp = `${Date.now()}`;
      ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.blend_orders_${stamp}`;
      usersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.blend_users_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${ordersFQN}\` (order_id INT64, user_id INT64, amount INT64)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${ordersFQN}\` (order_id, user_id, amount) VALUES
        (1, 10, 100),
        (2, 20, 200),
        (3, 10, 300),
        (4, 30, 400)`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${usersFQN}\` (user_id INT64, role STRING, country STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${usersFQN}\` (user_id, role, country) VALUES
        (10, 'admin',  'US'),
        (20, 'viewer', 'US'),
        (30, 'admin',  'DE')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [ordersFQN, usersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop blend table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('BASELINE (no slice): every order carries its joined user role', async () => {
      const rows = await runBlend(blendContext());
      expect(ids(rows)).toEqual([1, 2, 3, 4]);
      const roleByOrder = Object.fromEntries(rows.map(r => [Number(r.order_id), r.role]));
      expect(roleByOrder).toEqual({
        1: 'admin', // user 10
        2: 'viewer', // user 20
        3: 'admin', // user 10
        4: 'admin', // user 30
      });
    }, 120000);

    it('SLICE (pre-join role=admin): users_raw narrowed BEFORE join → order 2 (viewer) gets NULL role', async () => {
      const rows = await runBlend(
        blendContext({
          filters: [
            {
              column: 'users__role',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
          ],
        })
      );
      expect(ids(rows)).toEqual([1, 2, 3, 4]);
      const roleByOrder = Object.fromEntries(rows.map(r => [Number(r.order_id), r.role]));
      expect(roleByOrder[1]).toBe('admin');
      expect(roleByOrder[3]).toBe('admin');
      expect(roleByOrder[4]).toBe('admin');
      expect(roleByOrder[2]).toBeNull(); // sliced away → NULL after LEFT JOIN
    }, 120000);

    it('SLICE + post-join (role IS NOT NULL): joined dimension narrowed → result set {1,3,4}, order 2 eliminated', async () => {
      const rows = await runBlend(
        blendContext({
          filters: [
            {
              column: 'users__role',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
            },
            { column: 'role', operator: 'is_not_null', placement: 'post-join' },
          ],
        })
      );
      expect(ids(rows)).toEqual([1, 3, 4]);
      expect(rows.every(r => r.role === 'admin')).toBe(true);
    }, 120000);

    it('SLICE (pre-join role=viewer): only order 2 keeps a role; admins NULLed out', async () => {
      const rows = await runBlend(
        blendContext({
          filters: [
            {
              column: 'users__role',
              operator: 'eq',
              value: 'viewer',
              placement: 'pre-join',
            },
            { column: 'role', operator: 'is_not_null', placement: 'post-join' },
          ],
        })
      );
      expect(ids(rows)).toEqual([2]);
      expect(rows[0]?.role).toBe('viewer');
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended POST-JOIN aggregation — the canonical composite-key funnel on REAL
// BigQuery. This path (an outer GROUP BY over a joined/blended result) had only
// ever been exercised by unit string-tests; it had NEVER run against a real
// warehouse. The same class of gap previously hid the `(aggregated by SUM)`
// parens bug, so the value here is real execution, not string-matching.
// Uses its OWN two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed (composite-key, pre-aggregated marts → 1-to-1 join, no row multiplication):
//   sessions(date, channel, sessions): ('2024-01-01','paid',100) ('2024-01-01','organic',50)
//   events(date, channel, events):     ('2024-01-01','paid',10)  ('2024-01-01','organic',5)
//
// Join on the COMPOSITE key (date AND channel). The events CTE rolls up SUM by
// (date,channel) — identity here, one row per key — then main LEFT JOINs it.
// The outer SELECT groups by channel with SUM(sessions) + SUM(events). If the
// join fanned out, sessions would be inflated; it must stay 100/50.
describeIfCredentials(
  'Blended post-join aggregation — composite-key funnel (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let sessionsFQN: string;
    let eventsFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function eventsRelationship(
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id: 'rel-events',
        targetAlias: 'events',
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    // Composite-key context: post-join SUM(sessions) + SUM(events), group by channel.
    function compositeContext(): BlendedQueryContext {
      return {
        mainTableReference: `\`${sessionsFQN}\``,
        mainDataMartTitle: 'Sessions',
        mainDataMartUrl: 'http://x/sessions',
        chains: [
          {
            relationship: eventsRelationship([
              { sourceFieldName: 'date', targetFieldName: 'date' },
              { sourceFieldName: 'channel', targetFieldName: 'channel' },
            ]),
            targetTableReference: `\`${eventsFQN}\``,
            parentAlias: 'main',
            cteName: 'events',
            blendedFields: [
              {
                targetFieldName: 'events',
                outputAlias: 'events',
                isHidden: false,
                aggregateFunction: 'SUM',
              },
            ],
            targetDataMartTitle: 'Events',
            targetDataMartUrl: 'http://x/events',
          },
        ],
        columns: ['channel', 'sessions', 'events'],
        aggregations: [
          { column: 'sessions', function: 'SUM' },
          { column: 'events', function: 'SUM' },
        ],
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { jobId } = await adapter.executeQuery(sql, params);
      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });
      return rows as Record<string, unknown>[];
    }

    beforeAll(async () => {
      credentials = BigQueryServiceAccountCredentialsSchema.parse(
        JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
      );
      config = {
        projectId: BQ_PROJECT_ID!,
        location: BIGQUERY_AUTODETECT_LOCATION,
      };
      adapter = new BigQueryApiAdapter(credentials, config);

      const stamp = `${Date.now()}`;
      sessionsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.blend_agg_sessions_${stamp}`;
      eventsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.blend_agg_events_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${sessionsFQN}\` (date DATE, channel STRING, sessions INT64)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${sessionsFQN}\` (date, channel, sessions) VALUES
        (DATE '2024-01-01', 'paid',    100),
        (DATE '2024-01-01', 'organic', 50)`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${eventsFQN}\` (date DATE, channel STRING, events INT64)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${eventsFQN}\` (date, channel, events) VALUES
        (DATE '2024-01-01', 'paid',    10),
        (DATE '2024-01-01', 'organic', 5)`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [sessionsFQN, eventsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop blend-agg table ${fqn}:`, error);
        }
      }
    }, 60000);

    // The headline case: the composite-key join is 1-to-1, so the outer GROUP BY
    // yields exactly one row per channel with un-inflated SUM(sessions) and the
    // joined SUM(events). A fan-out would multiply sessions; the assertion would
    // then fail (which is the entire point of running this for real).
    it('composite-key (date AND channel) post-join SUM stays 1-to-1: paid 100/10, organic 50/5', async () => {
      const rows = await runBlend(compositeContext());

      expect(rows).toHaveLength(2);
      const byChannel = new Map(rows.map(r => [String(r.channel), r]));

      const paid = byChannel.get('paid')!;
      expect(paid).toBeDefined();
      expect(Number(paid['sessions | SUM'])).toBe(100);
      expect(Number(paid['events | SUM'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(organic).toBeDefined();
      expect(Number(organic['sessions | SUM'])).toBe(50);
      expect(Number(organic['events | SUM'])).toBe(5);
    }, 120000);

    // Same shape with a single-column join (channel only). The events table here
    // has one row per channel, so it is also 1-to-1 — proves the simpler join path
    // executes and aggregates correctly on real BigQuery too.
    it('single-key (channel only) post-join SUM also executes 1-to-1: paid 100/10, organic 50/5', async () => {
      const context = compositeContext();
      context.chains[0].relationship = eventsRelationship([
        { sourceFieldName: 'channel', targetFieldName: 'channel' },
      ]);

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const byChannel = new Map(rows.map(r => [String(r.channel), r]));

      const paid = byChannel.get('paid')!;
      expect(Number(paid['sessions | SUM'])).toBe(100);
      expect(Number(paid['events | SUM'])).toBe(10);

      const organic = byChannel.get('organic')!;
      expect(Number(organic['sessions | SUM'])).toBe(50);
      expect(Number(organic['events | SUM'])).toBe(5);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Unique Count — composite primary key (THE risky path on real BigQuery).
// ---------------------------------------------------------------------------
// BigQuery does not support COUNT(DISTINCT a, b) — the composite-PK path
// uses CONCAT(COALESCE(CAST(a AS STRING), ''), '␟', COALESCE(CAST(b AS STRING), ''))
// which string-tests cannot validate. Run it on real BQ and assert correct tuple counts.
//
// Seed table: pairs_<ts>(grp STRING, a STRING, b STRING)
//   Group 'g': ('g','x','1'), ('g','x','2'), ('g','y','1')
//     → distinct (a,b) tuples = 3  (= distinct-a=2 AND distinct-b=2 → proves tuple counting)
//   Group 'h': ('h','z','9'), ('h','z','9')
//     → distinct (a,b) tuples = 1  (proves dedup of repeated exact tuples)
describeIfCredentials(
  'Unique Count — composite primary key CONCAT/COALESCE/CAST form (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let pairsFQN: string;

    const builder = new BigQueryQueryBuilder(new BigQueryClauseRenderer());

    async function runUniquePairs(
      queryOptions: Parameters<BigQueryQueryBuilder['buildQuery']>[1]
    ): Promise<Record<string, unknown>[]> {
      const definition: TableDefinition = { fullyQualifiedName: pairsFQN };
      const built = await builder.buildQuery(definition, queryOptions);
      if (typeof built === 'string')
        throw new Error('expected QueryBuildResult with output controls');
      const { jobId } = await adapter.executeQuery(built.sql, built.params);
      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });
      return rows as Record<string, unknown>[];
    }

    beforeAll(async () => {
      credentials = BigQueryServiceAccountCredentialsSchema.parse(
        JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
      );
      config = {
        projectId: BQ_PROJECT_ID!,
        location: BIGQUERY_AUTODETECT_LOCATION,
      };
      adapter = new BigQueryApiAdapter(credentials, config);

      const stamp = `${Date.now()}`;
      pairsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.pairs_${stamp}`;

      await adapter.executeQuery(`CREATE TABLE \`${pairsFQN}\` (grp STRING, a STRING, b STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${pairsFQN}\` (grp, a, b) VALUES
          ('g', 'x', '1'),
          ('g', 'x', '2'),
          ('g', 'y', '1'),
          ('h', 'z', '9'),
          ('h', 'z', '9')`
      );
    }, 120000);

    afterAll(async () => {
      try {
        await adapter.executeQuery(`DROP TABLE IF EXISTS \`${pairsFQN}\``);
      } catch (error) {
        console.warn('Failed to drop pairs test table during teardown:', error);
      }
    }, 30000);

    // Case 3 — THE risky path. Composite PK (a, b) grouped by grp.
    // Group 'g': (x,1),(x,2),(y,1) → 3 distinct tuples. This is > distinct-a(2) and
    // distinct-b(2), proving the CONCAT counts whole tuples, not individual columns.
    // Group 'h': (z,9),(z,9) → 1 distinct tuple (dedup of repeated pair).
    it('composite-PK (a,b) Unique Count groups by grp: g → 3 tuples, h → 1 (dedup)', async () => {
      const rows = await runUniquePairs({
        columns: ['grp'],
        uniqueCount: true,
        primaryKeyColumns: ['a', 'b'],
      });

      expect(rows).toHaveLength(2);
      const byGrp = new Map(rows.map(r => [String(r.grp), r]));

      // 'g' has 3 distinct (a,b) tuples: (x,1),(x,2),(y,1).
      const g = byGrp.get('g')!;
      expect(g).toBeDefined();
      expect(Number(g['Unique Count'])).toBe(3);

      // 'h' has 1 distinct tuple despite 2 rows: (z,9) is repeated.
      const h = byGrp.get('h')!;
      expect(h).toBeDefined();
      expect(Number(h['Unique Count'])).toBe(1);
    }, 60000);
  }
);

// ---------------------------------------------------------------------------
// Blended POST-JOIN aggregation — dedup COUNT_DISTINCT re-aggregated with SUM
// (the #6733 funnel fix, real BigQuery). Unlike the composite-key funnel
// above, add_to_cart/purchase are per-HIT fact tables, not pre-aggregated to
// the join grain. Their dedup key (hitId / transactionId) is deduplicated
// INSIDE the child CTE with COUNT_DISTINCT (grouped by the composite join key
// date+sessionId), then the outer report-level aggregation re-sums those
// per-session counts across the report's GROUP BY dimensions. Before #6733
// the dedup step used STRING_AGG, which collapsed same-session hits and
// under-counted the funnel; COUNT_DISTINCT-inside-CTE then SUM-outside is the
// fix. Uses its OWN 3 seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed ("Kolya's funnel" — the exact scenario #6733 fixes), joined by
// (date, sessionId), session is MAIN:
//   session(date, sessionId, country, dataSource):
//     2026-01-01 s1 UA WEB · 2026-01-01 s2 UA WEB · 2026-01-02 s3 PL WEB ·
//     2026-01-02 s4 UA APP · 2026-01-03 s5 US WEB · 2026-01-02 s6 PL WEB ·
//     2026-01-03 s7 CA APP · 2026-01-03 s8 US APP
//   add_to_cart(date, sessionId, hitId):
//     2026-01-01 s1 h1 · 2026-01-01 s1 h2 · 2026-01-03 s5 h1 ·
//     2026-01-03 s7 h1 · 2026-01-03 s7 h2
//   purchase(date, sessionId, transactionId, revenue):
//     2026-01-01 s1 t1 200 · 2026-01-03 s7 t1 100 · 2026-01-03 s7 t2 200
//
// The headline proof: session s1 (2026-01-01, UA, WEB) logged 2 add-to-cart
// hits (h1, h2) under the SAME sessionId. STRING_AGG dedup (pre-#6733) folded
// same-session hits into a collapsed value and under-counted; COUNT_DISTINCT
// inside the add_to_cart CTE correctly yields 2 for s1, and the outer SUM
// (s2 contributes NULL — no add-to-cart rows) keeps the UA/WEB total at 2.
// Session s7 (2026-01-03, CA, APP) proves the same dedup for BOTH joined
// marts at once: 2 distinct hits AND 2 distinct transactions.
describeIfCredentials(
  'Blended post-join aggregation — dedup COUNT_DISTINCT then SUM funnel (#6733, real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let sessionFQN: string;
    let addToCartFQN: string;
    let purchaseFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function funnelRelationship(
      id: string,
      targetAlias: string,
      joinConditions: { sourceFieldName: string; targetFieldName: string }[]
    ): DataMartRelationship {
      return {
        id,
        targetAlias,
        joinConditions,
        blendedFields: [],
        projectId: 'proj',
        createdById: 'user-1',
        createdAt: new Date(),
        modifiedAt: new Date(),
      } as unknown as DataMartRelationship;
    }

    const joinOnDateAndSession = [
      { sourceFieldName: 'date', targetFieldName: 'date' },
      { sourceFieldName: 'sessionId', targetFieldName: 'sessionId' },
    ];

    // dims = date, country, dataSource (report GROUP BY); metrics = sessions
    // (COUNT_DISTINCT sessionId on MAIN), addToCarts / transactions (post-join
    // SUM of the CTE-deduped COUNT_DISTINCT), revenue (post-join SUM).
    function funnelContext(): BlendedQueryContext {
      return {
        mainTableReference: `\`${sessionFQN}\``,
        mainDataMartTitle: 'Session',
        mainDataMartUrl: 'http://x/session',
        chains: [
          {
            relationship: funnelRelationship(
              'rel-add-to-cart',
              'add_to_cart',
              joinOnDateAndSession
            ),
            targetTableReference: `\`${addToCartFQN}\``,
            parentAlias: 'main',
            cteName: 'add_to_cart',
            blendedFields: [
              {
                targetFieldName: 'hitId',
                outputAlias: 'addToCarts',
                isHidden: false,
                aggregateFunction: 'COUNT_DISTINCT',
              },
            ],
            targetDataMartTitle: 'Add To Cart',
            targetDataMartUrl: 'http://x/add-to-cart',
          },
          {
            relationship: funnelRelationship('rel-purchase', 'purchase', joinOnDateAndSession),
            targetTableReference: `\`${purchaseFQN}\``,
            parentAlias: 'main',
            cteName: 'purchase',
            blendedFields: [
              {
                targetFieldName: 'transactionId',
                outputAlias: 'transactions',
                isHidden: false,
                aggregateFunction: 'COUNT_DISTINCT',
              },
              {
                targetFieldName: 'revenue',
                outputAlias: 'revenue',
                isHidden: false,
                aggregateFunction: 'SUM',
              },
            ],
            targetDataMartTitle: 'Purchase',
            targetDataMartUrl: 'http://x/purchase',
          },
        ],
        columns: [
          'date',
          'country',
          'dataSource',
          'sessionId',
          'addToCarts',
          'transactions',
          'revenue',
        ],
        aggregations: [
          { column: 'sessionId', function: 'COUNT_DISTINCT' },
          { column: 'addToCarts', function: 'SUM' },
          { column: 'transactions', function: 'SUM' },
          { column: 'revenue', function: 'SUM' },
        ],
      };
    }

    async function runBlend(context: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { jobId } = await adapter.executeQuery(sql, params);
      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });
      return rows as Record<string, unknown>[];
    }

    beforeAll(async () => {
      credentials = BigQueryServiceAccountCredentialsSchema.parse(
        JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
      );
      config = {
        projectId: BQ_PROJECT_ID!,
        location: BIGQUERY_AUTODETECT_LOCATION,
      };
      adapter = new BigQueryApiAdapter(credentials, config);

      const stamp = `${Date.now()}`;
      sessionFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.funnel_session_${stamp}`;
      addToCartFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.funnel_add_to_cart_${stamp}`;
      purchaseFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.funnel_purchase_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${sessionFQN}\` (date DATE, sessionId STRING, country STRING, dataSource STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${sessionFQN}\` (date, sessionId, country, dataSource) VALUES
        (DATE '2026-01-01', 's1', 'UA', 'WEB'),
        (DATE '2026-01-01', 's2', 'UA', 'WEB'),
        (DATE '2026-01-02', 's3', 'PL', 'WEB'),
        (DATE '2026-01-02', 's4', 'UA', 'APP'),
        (DATE '2026-01-03', 's5', 'US', 'WEB'),
        (DATE '2026-01-02', 's6', 'PL', 'WEB'),
        (DATE '2026-01-03', 's7', 'CA', 'APP'),
        (DATE '2026-01-03', 's8', 'US', 'APP')`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${addToCartFQN}\` (date DATE, sessionId STRING, hitId STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${addToCartFQN}\` (date, sessionId, hitId) VALUES
        (DATE '2026-01-01', 's1', 'h1'),
        (DATE '2026-01-01', 's1', 'h2'),
        (DATE '2026-01-03', 's5', 'h1'),
        (DATE '2026-01-03', 's7', 'h1'),
        (DATE '2026-01-03', 's7', 'h2')`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${purchaseFQN}\` (date DATE, sessionId STRING, transactionId STRING, revenue NUMERIC)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${purchaseFQN}\` (date, sessionId, transactionId, revenue) VALUES
        (DATE '2026-01-01', 's1', 't1', 200),
        (DATE '2026-01-03', 's7', 't1', 100),
        (DATE '2026-01-03', 's7', 't2', 200)`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [sessionFQN, addToCartFQN, purchaseFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop funnel table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('dedup COUNT_DISTINCT(hitId/transactionId) then post-join SUM produces correct funnel counts', async () => {
      const rows = await runBlend(funnelContext());

      const dateKey = (r: Record<string, unknown>): string =>
        String((r.date as { value?: string } | undefined)?.value ?? r.date).slice(0, 10);
      const byKey = new Map(rows.map(r => [`${dateKey(r)}|${r.country}|${r.dataSource}`, r]));

      // THE headline case (was under-counted pre-#6733): s1 logged 2 distinct
      // hits (h1, h2) under the SAME sessionId; s2 has none. STRING_AGG dedup
      // used to collapse same-session hits — COUNT_DISTINCT inside the CTE +
      // outer SUM correctly yields 2.
      const uaWeb = byKey.get('2026-01-01|UA|WEB')!;
      expect(uaWeb).toBeDefined();
      expect(Number(uaWeb['sessionId | COUNTUNIQUE'])).toBe(2);
      expect(Number(uaWeb['addToCarts | SUM'])).toBe(2);
      expect(Number(uaWeb['transactions | SUM'])).toBe(1);
      expect(Number(uaWeb['revenue | SUM'])).toBe(200);

      // Second proof point: s7 logged 2 distinct hits AND 2 distinct
      // transactions under the same sessionId — dedup must hold for both
      // joined marts simultaneously.
      const caApp = byKey.get('2026-01-03|CA|APP')!;
      expect(caApp).toBeDefined();
      expect(Number(caApp['sessionId | COUNTUNIQUE'])).toBe(1);
      expect(Number(caApp['addToCarts | SUM'])).toBe(2);
      expect(Number(caApp['transactions | SUM'])).toBe(2);
      expect(Number(caApp['revenue | SUM'])).toBe(300);

      // us/web (s5): 1 distinct hit, no purchase.
      const usWeb = byKey.get('2026-01-03|US|WEB')!;
      expect(usWeb).toBeDefined();
      expect(Number(usWeb['sessionId | COUNTUNIQUE'])).toBe(1);
      expect(Number(usWeb['addToCarts | SUM'])).toBe(1);
    }, 120000);
  }
);
