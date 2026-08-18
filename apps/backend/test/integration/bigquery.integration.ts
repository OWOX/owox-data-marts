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
import { ReportSqlComposerService } from 'src/data-marts/services/report-sql-composer.service';
import { Report } from 'src/data-marts/entities/report.entity';
import { BlendedFieldDto } from 'src/data-marts/dto/domain/blendable-schema.dto';
import { extractCteBody } from '@owox/test-utils';

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
  // (An alias with a SPACE IS accepted — BigQuery flexible column names.)
  //
  // Fix: aggregation-labels.ts now emits a parens-free alias `<col> | TOKEN`
  // (the `|` is verified-legal in BQ output column names; spaces are accepted too). These
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

      // active = false → id 2 with amount 20.0
      const inactive = byActive.get(false)!;
      expect(inactive).toBeDefined();
      expect(Number(inactive['amount | SUM'])).toBeCloseTo(20.0, 5);
      expect(Number(inactive['amount | AVG'])).toBeCloseTo(20.0, 5);
      expect(Number(inactive['id | COUNTUNIQUE'])).toBe(1);
    }, 60000);

    it('date-trunc MONTH + SUM executes and buckets each row into its own month', async () => {
      const rows = await runWithAggregations({
        columns: ['created_at', 'amount'],
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
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row['amount | SUM'])).toBeCloseTo(100.5, 5);
      expect(Number(row['id | COUNTUNIQUE'])).toBe(4);
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
    it('grand SUM with active=is_true filter executes; SUM covers only matched rows', async () => {
      const rows = await runWithAggregations({
        columns: ['amount'],
        filters: [{ column: 'active', operator: 'is_true' }],
        aggregations: [{ column: 'amount', function: 'SUM' }],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      // Filtered set ids 1,3,4 → 10.5 + 30 + 40 = 80.5.
      expect(Number(row['amount | SUM'])).toBeCloseTo(80.5, 5);
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
    }, 60000);

    // Case 9 — empty result. A grand aggregate over the empty set still yields ONE row.
    it('empty-result grand aggregate executes; one row with zero COUNTUNIQUE and null SUM', async () => {
      const rows = await runWithAggregations({
        columns: ['amount', 'id'],
        filters: [{ column: 'name', operator: 'eq', value: 'definitely-no-match' }],
        aggregations: [
          { column: 'amount', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      // Grand aggregate over zero matched rows is still a single row.
      expect(rows).toHaveLength(1);
      const row = rows[0];
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
    //                    operators keep NULLs: neq/not_in/not_contains/not_regex include it,
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

  it('not_in: score not in (20, 30) → rows 1,4,5,6,7,8 (null-inclusive: NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'not_in', value: [20, 30] }],
    });
    expect(ids(rows)).toEqual([1, 4, 5, 6, 7, 8]);
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
      // 'events' is a joined (blended) column with a genuine pre-join SUM
      // roll-up (not an ANY_VALUE passthrough), so the report-level SUM routes through
      // the value sleeve — which needs the field index to resolve the owner chain/column.
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'events', aliasPath: 'events', originalFieldName: 'events', type: 'INT64' },
        ],
        availableSources: [{ aliasPath: 'events', isIncluded: true }],
      } as never);
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
        fieldIndex,
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
// (the funnel fix, real BigQuery). Unlike the composite-key funnel
// above, add_to_cart/purchase are per-HIT fact tables, not pre-aggregated to
// the join grain. Their dedup key (hitId / transactionId) is deduplicated
// INSIDE the child CTE with COUNT_DISTINCT (grouped by the composite join key
// date+sessionId), then the outer report-level aggregation re-sums those
// per-session counts across the report's GROUP BY dimensions. Before
// the dedup step used STRING_AGG, which collapsed same-session hits and
// under-counted the funnel; COUNT_DISTINCT-inside-CTE then SUM-outside is the
// fix. Uses its OWN 3 seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed ("Kolya's funnel" — the exact scenario fixes), joined by
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
// hits (h1, h2) under the SAME sessionId. STRING_AGG dedup folded
// same-session hits into a collapsed value and under-counted; COUNT_DISTINCT
// inside the add_to_cart CTE correctly yields 2 for s1, and the outer SUM
// (s2 contributes NULL — no add-to-cart rows) keeps the UA/WEB total at 2.
// Session s7 (2026-01-03, CA, APP) proves the same dedup for BOTH joined
// marts at once: 2 distinct hits AND 2 distinct transactions.
describeIfCredentials(
  'Blended post-join aggregation — dedup COUNT_DISTINCT then SUM funnel (real BigQuery)',
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
      // 'addToCarts'/'transactions' (pre-join COUNT_DISTINCT) and 'revenue'
      // (pre-join SUM) are all NON-IDENTITY blended columns — their report-level SUM
      // routes through the value sleeve, which needs the field index to resolve each
      // owner chain/column.
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'addToCarts',
            aliasPath: 'add_to_cart',
            originalFieldName: 'hitId',
            type: 'STRING',
          },
          {
            name: 'transactions',
            aliasPath: 'purchase',
            originalFieldName: 'transactionId',
            type: 'STRING',
          },
          {
            name: 'revenue',
            aliasPath: 'purchase',
            originalFieldName: 'revenue',
            type: 'NUMERIC',
          },
        ],
        availableSources: [
          { aliasPath: 'add_to_cart', isIncluded: true },
          { aliasPath: 'purchase', isIncluded: true },
        ],
      } as never);
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
        fieldIndex,
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

      // THE headline case (was under-counted): s1 logged 2 distinct
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

// ---------------------------------------------------------------------------
// Blended COUNT_DISTINCT through a bridge — "metric sleeve" fix (, real
// BigQuery). This proves the N-hop NESTED-bridge variant: a 2-hop chain
// events -> users -> organizations, where `organizations` is a CHILD of
// `users` (org_id lives on users), NOT a sibling of it. Main = events
// (bridge/fact grain); `users` is a ROOT chain off main (dimension: country);
// `organizations` hangs off users (metric: distinct org count). Because the
// metric column is two hops from main, the sleeve must re-join BOTH raw CTEs
// (Task 3's N-hop ancestor closure) — that closure is exactly what this case
// exercises against a real warehouse.
//
// Before this fix, a joined COUNT_DISTINCT metric was read off the bottom-up
// dedup CTE chain, where each intermediate level collapses multiple raw rows
// per parent-join-key via ANY_VALUE/MAX — the SAME collapse additive/idempotent
// metrics rely on. That collapse is lossless ONLY when a join key maps to
// exactly one raw value; it breaks the moment a user genuinely belongs to more
// than one org: MAX(orgId) silently keeps just ONE of the user's orgs and
// drops the rest, so the OLD path UNDER-counts the report's COUNT_DISTINCT
// (this nested topology). The sleeve fixes it by re-joining the RAW (pre-dedup)
// path and counting distinct at the report's OWN dimension grain, bypassing
// every intermediate collapse. Uses its OWN 3 seeded tables + beforeAll/afterAll.
//
// NOTE — this is intentionally NOT the prototype's flagship Scenario 2. That one
// (tmp/mcp/tasks/6766-symmetric-aggregates-fanout/6766_examples_events_users_orgs.sql)
// is a SIBLING topology (events.user_id=users.userId AND events.org_id=orgs.orgId,
// both joined directly off events), whose OLD-path bug is an OVER-count (SUM of
// per-user COUNT DISTINCT double-counts an org reached via two users) with ground
// truth US=1/DE=1/UA=1/PL=1/total=3. That sibling over-count scenario is a
// documented FAST-FOLLOW, not covered by this task; here we prove the
// complementary nested-bridge under-count instead.
//
// Seed — org membership lives on `users` (org info reaches `events` through
// the users bridge), and u1 genuinely belongs to TWO orgs:
//   users(userId, country, org_id): u1 US o1 · u1 US o4 (TWO membership rows)
//                                    u2 US o5 · u3 DE o2 · u4 UA o3 · u5 PL o3
//   organizations(orgId): o1, o2, o3, o4, o5
//   events(event_id, user_id): e1 u1 · e2 u1 · e3 u2 · e4 u3 · e5 u3 ·
//                              e6 u4 · e7 u4 · e8 u5
//
// Ground truth (unique orgs per country): US=3 {o1,o4,o5}, DE=1 {o2},
// UA=1 {o3}, PL=1 {o3}. Grand total distinct = 5 {o1,o2,o3,o4,o5}.
//
// Verified pre-fix (temporarily reverting the sleeve wiring and re-running
// this exact seed through the builder): the `users` aggregation CTE groups by
// userId (u1's own join key to main) and re-aggregates the child
// `organizations` passthrough via MAX(orgId) — for u1 that MAX arbitrarily
// keeps 'o4' and drops 'o1'. Since 'o1' appears nowhere else in the seed, it
// vanishes entirely: US comes back as 2 (not 3) and the grand total as 4
// (not 5) under the pre-fix dedup-then-read mechanism.
describeIfCredentials(
  'Blended COUNT_DISTINCT through a bridge — metric sleeve (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let eventsFQN: string;
    let usersFQN: string;
    let organizationsFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function bridgeRelationship(
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

    // main -> users (dimension: country) -> organizations (metric: COUNT_DISTINCT
    // orgId, nested UNDER users, not a sibling root chain).
    function bridgeContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__country',
            aliasPath: 'users',
            originalFieldName: 'country',
            type: 'STRING',
          },
          {
            // Second countable column on the SAME chain as `country` — that shared owner is what
            // makes the two COUNT DISTINCT metrics merge into ONE sleeve CTE.
            name: 'users__org_id',
            aliasPath: 'users',
            originalFieldName: 'org_id',
            type: 'STRING',
          },
          {
            name: 'organizations__orgId',
            aliasPath: 'organizations',
            originalFieldName: 'orgId',
            type: 'STRING',
          },
        ],
        availableSources: [
          { aliasPath: 'users', isIncluded: true },
          { aliasPath: 'organizations', isIncluded: true },
        ],
      } as never);

      return {
        mainTableReference: `\`${eventsFQN}\``,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: bridgeRelationship('rel-users', 'users', [
              { sourceFieldName: 'user_id', targetFieldName: 'userId' },
            ]),
            targetTableReference: `\`${usersFQN}\``,
            parentAlias: 'main',
            cteName: 'users',
            blendedFields: [
              {
                targetFieldName: 'country',
                outputAlias: 'users__country',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
              {
                targetFieldName: 'org_id',
                outputAlias: 'users__org_id',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Users',
            targetDataMartUrl: 'http://x/users',
          },
          {
            relationship: bridgeRelationship('rel-organizations', 'organizations', [
              { sourceFieldName: 'org_id', targetFieldName: 'orgId' },
            ]),
            targetTableReference: `\`${organizationsFQN}\``,
            parentAlias: 'users',
            cteName: 'organizations',
            blendedFields: [
              {
                targetFieldName: 'orgId',
                outputAlias: 'organizations__orgId',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Organizations',
            targetDataMartUrl: 'http://x/organizations',
          },
        ],
        columns: ['users__country', 'organizations__orgId'],
        aggregations: [{ column: 'organizations__orgId', function: 'COUNT_DISTINCT' }],
        fieldIndex,
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
      eventsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.bridge_events_${stamp}`;
      usersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.bridge_users_${stamp}`;
      organizationsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.bridge_organizations_${stamp}`;

      await adapter.executeQuery(`CREATE TABLE \`${eventsFQN}\` (event_id STRING, user_id STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${eventsFQN}\` (event_id, user_id) VALUES
        ('e1','u1'), ('e2','u1'), ('e3','u2'),
        ('e4','u3'), ('e5','u3'),
        ('e6','u4'), ('e7','u4'), ('e8','u5')`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${usersFQN}\` (userId STRING, country STRING, org_id STRING)`
      );
      // u1 genuinely belongs to TWO orgs (o1 AND o4) — the fan-out that breaks the
      // pre-fix dedup-then-read mechanism (see block comment above).
      await adapter.executeQuery(
        `INSERT INTO \`${usersFQN}\` (userId, country, org_id) VALUES
        ('u1','US','o1'), ('u1','US','o4'),
        ('u2','US','o5'),
        ('u3','DE','o2'),
        ('u4','UA','o3'),
        ('u5','PL','o3')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${organizationsFQN}\` (orgId STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${organizationsFQN}\` (orgId) VALUES ('o1'), ('o2'), ('o3'), ('o4'), ('o5')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, usersFQN, organizationsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop bridge table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('fan-out: joined COUNT DISTINCT is correct through a bridge (sleeve): US=3, DE=1, UA=1, PL=1', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(4);
      const byCountry = new Map(
        rows.map(r => [String(r.users__country), Number(r['organizations__orgId | COUNTUNIQUE'])])
      );

      // THE headline case (under-counted pre-fix): u1 genuinely belongs to TWO
      // orgs (o1, o4); u2 belongs to a third (o5) — US must show all 3, not the
      // pre-fix MAX-collapsed 2.
      expect(byCountry.get('US')).toBe(3);
      expect(byCountry.get('DE')).toBe(1);
      expect(byCountry.get('UA')).toBe(1);
      expect(byCountry.get('PL')).toBe(1);
    }, 120000);

    it('grand total (no grouping) also stays correct through the bridge: 5 distinct orgs, not the pre-fix 4', async () => {
      const context = bridgeContext();
      context.columns = ['organizations__orgId']; // dimensionless: no report GROUP BY
      const rows = await runBlend(context);

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['organizations__orgId | COUNTUNIQUE'])).toBe(5);
    }, 120000);

    // MERGED COUNT DISTINCT sleeve, live. Two COUNT DISTINCT metrics on the
    // SAME owner chain share ONE CTE, so it emits several `COUNT(DISTINCT …)` in a single SELECT.
    // Nothing proved a warehouse accepts that shape: the merge is asserted at unit level (SQL
    // text) and every live sleeve test so far counted exactly one column. Redshift in particular
    // has a history of restricting multiple COUNT(DISTINCT) per query, and it is the reason this
    // case was called out as unverified before release.
    //
    // Grand total over the bridge seed (u1 belongs to TWO orgs, so the join fans out):
    //   distinct countries = US, DE, UA, PL          -> 4
    //   distinct org ids   = o1, o4, o5, o2, o3      -> 5
    it('fan-out: merged COUNT DISTINCT sleeve: two counts in ONE CTE stay correct (countries=4, orgs=5)', async () => {
      const context = bridgeContext();
      context.columns = ['users__country', 'users__org_id'];
      context.aggregations = [
        { column: 'users__country', function: 'COUNT_DISTINCT' },
        { column: 'users__org_id', function: 'COUNT_DISTINCT' },
      ];

      // Guard the premise: if the two metrics stopped merging, the numbers below would still
      // pass while this test no longer covered the shape it exists for.
      const { sql } = builder.buildBlendedQuery(context);
      expect(sql).toContain('sleeve_users_counts AS (');
      expect((sql.match(/COUNT\(DISTINCT /g) ?? []).length).toBe(2);

      const rows = await runBlend(context);

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['users__country | COUNTUNIQUE'])).toBe(4);
      expect(Number(rows[0]['users__org_id | COUNTUNIQUE'])).toBe(5);
    }, 120000);

    // Closes the gap between the unit-level composer proof (report-sql-composer.aggregation.spec.ts,
    // 'routes a JOINED COUNT_DISTINCT total through a metric sleeve') and the hand-built sleeve
    // query above: drives the SAME two-hop bridge (events -> users -> organizations) through
    // ReportSqlComposerService.composeTotals — not buildBlendedQuery directly — so the composer's
    // derive -> plan -> compose -> sleeve wiring is exercised end-to-end, then executes the EXACT
    // emitted totals SQL on real BigQuery.
    it('composeTotals emits sleeve SQL that returns the correct joined distinct count on real BigQuery (=5)', async () => {
      // A STRING joined field two hops from main, aggregated post-join as COUNT_DISTINCT. Mirrors
      // makeBlendedTotalsComposer in report-sql-composer.aggregation.spec.ts: resolveBlendingDecision
      // is mocked to forward the totals plan's columns/aggregations into the real bridgeContext()
      // and invoke the REAL BigQueryBlendedQueryBuilder, so the emitted SQL is byte-identical to
      // what the totals path would produce in production.
      const organizationsField = Object.assign(new BlendedFieldDto(), {
        name: 'organizations__orgId',
        sourceRelationshipId: 'rel-organizations',
        sourceDataMartId: 'dm-organizations',
        sourceDataMartTitle: 'Organizations',
        targetAlias: 'organizations',
        originalFieldName: 'orgId',
        type: 'STRING',
        sourceFieldType: 'STRING',
        alias: '',
        description: '',
        isHidden: false,
        aggregateFunction: 'ANY_VALUE',
        postJoinAggregations: ['COUNT_DISTINCT'],
        transitiveDepth: 2,
        aliasPath: 'users.organizations',
        outputPrefix: 'Organizations',
      });

      const blendedReportDataService = {
        resolveBlendingDecision: jest.fn(async (plan: Partial<Report>) => {
          const built = builder.buildBlendedQuery({
            ...bridgeContext(),
            columns: plan.columnConfig ?? [],
            aggregations: plan.aggregationConfig ?? undefined,
          });
          return { needsBlending: true, blendedSql: built.sql, params: built.params };
        }),
      };
      const composer = new ReportSqlComposerService(
        blendedReportDataService as never,
        { buildQuery: jest.fn() } as never,
        { resolveTableName: jest.fn() } as never,
        { isSupported: jest.fn().mockReturnValue(true) } as never,
        {
          computeBlendableSchema: jest
            .fn()
            .mockResolvedValue({ nativeFields: [], blendedFields: [organizationsField] }),
        } as never,
        // The composer validates the REPORT's own config before deriving a Totals restriction from
        // its HAVING rules (that precondition used to hold by call order alone).
        { validateForReport: jest.fn().mockResolvedValue(undefined) } as never
      );

      const report = {
        dataMart: {
          id: 'dm-events',
          projectId: 'proj-1',
          definition: { type: 'table', fullyQualifiedName: eventsFQN },
          storage: { id: 'storage-1', type: 'GOOGLE_BIGQUERY' },
          schema: { type: 'bigquery-data-mart-schema', fields: [] },
        },
        columnConfig: ['organizations__orgId'],
        aggregationConfig: [{ column: 'organizations__orgId', function: 'COUNT_DISTINCT' }],
      } as unknown as Report;

      const totals = await composer.composeTotals(report, {} as never);

      expect(totals).not.toBeNull();
      // The presence of the sleeve CTE + CROSS JOIN is the proof this is the slice-1 sleeve
      // path (re-join raw, DISTINCT at the grand-total grain), not the pre-fix dedup+SUM
      // re-aggregation over the bottom-up chain.
      expect(totals!.sql).toContain('sleeve_organizations__orgId');
      expect(totals!.sql).toContain('CROSS JOIN');

      const { jobId } = await adapter.executeQuery(totals!.sql, totals!.params);
      const job = await adapter.getJob(jobId);
      const destinationTable = job.metadata.configuration.query.destinationTable;
      const table = adapter.createTableReference(
        destinationTable.projectId,
        destinationTable.datasetId,
        destinationTable.tableId
      );
      const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });

      expect(rows).toHaveLength(1);
      expect(Number(Object.values(rows[0] as Record<string, unknown>)[0])).toBe(5);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended COUNT_DISTINCT through a bridge — SIBLING topology (, real
// BigQuery). Complements the NESTED case above with the prototype's flagship
// shape: main = events (event_id, user_id, org_id), and TWO DIRECT (sibling)
// chains off main — events.user_id -> users.userId (dimension: country) and
// events.org_id -> organizations.orgId (metric: COUNT_DISTINCT orgId). Both
// chains have parentAlias='main'; organizations is NOT nested under users.
//
// EMPIRICAL FINDING (this is a NON-REGRESSION test, not a bug guard): unlike
// the nested case, this topology was ALREADY correct before the sleeve fix,
// and the sleeve does not change the result. Reasoning: with main=events at
// full row grain, the pre-fix `organizations` aggregation CTE groups by its
// OWN natural key (`orgId` — that's both the join's target field AND the
// metric column), so `ANY_VALUE(orgId) GROUP BY orgId` is a lossless identity
// projection (no passthrough/MAX collapse is involved, since organizations
// has no children to pass through). The outer join is then a plain 1:1
// lookup on each of the two independent keys, so
// `COUNT(DISTINCT organizations.organizations__orgId) GROUP BY country`
// already matches the report's true dimension grain. The pre-fix
// UNDER-count in the nested case above only happens because an INTERMEDIATE
// level (users) re-groups the metric by a DIFFERENT key than the metric's
// own natural key, forcing a lossy MAX; that mechanism cannot occur here
// because both chains are roots directly off main.
//
// Verified by literally reconstructing the pre-fix builder (checked out
// `abstract-blended-query-builder.ts` at 2680781ee, the last commit before
// the sleeve CTE was introduced by f3ed9debe) and re-running this exact
// context against this exact seed on real BigQuery: pre-fix produced the
// IDENTICAL US=1/DE=1/UA=1/PL=1, total=3 as the post-fix sleeve path. This
// case therefore proves the sleeve routing did NOT break the already-correct
// sibling case — it is a regression guard for the REFACTOR, not for a bug.
//
// Seed (adapted from the prototype's flagship Scenario 2):
//   users(userId, country): u1 US · u2 US · u3 DE · u4 UA · u5 PL
//   organizations(orgId): o1, o2, o3
//   events(event_id, user_id, org_id):
//     e1 u1 o1 · e2 u1 o1 · e3 u2 o1 (US's events all land on org o1)
//     e4 u3 o2 · e5 u3 o2                (DE's events all land on org o2)
//     e6 u4 o3 · e7 u4 o3                (UA's events all land on org o3)
//     e8 u5 o3                           (PL's event also lands on org o3)
//
// Ground truth (unique orgs per country, hand-computed from the seed above):
// US={o1}=1, DE={o2}=1, UA={o3}=1, PL={o3}=1. Grand total distinct = {o1,o2,o3} = 3.
// (o3 is shared by two countries — UA and PL — which is why a naive
// "sum of per-country distincts" would overcount the GRAND TOTAL to 4; the
// grand-total sleeve/pre-fix path both correctly dedup to 3.)
describeIfCredentials(
  'Blended COUNT_DISTINCT through a bridge — SIBLING topology (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let eventsFQN: string;
    let usersFQN: string;
    let organizationsFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function bridgeRelationship(
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

    // main -> users (dimension: country) AND main -> organizations (metric:
    // COUNT_DISTINCT orgId) — BOTH chains are ROOTS off main (siblings), NOT
    // nested under each other. org_id lives on events (main), not on users.
    function bridgeContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'users__country',
            aliasPath: 'users',
            originalFieldName: 'country',
            type: 'STRING',
          },
          {
            name: 'organizations__orgId',
            aliasPath: 'organizations',
            originalFieldName: 'orgId',
            type: 'STRING',
          },
        ],
        availableSources: [
          { aliasPath: 'users', isIncluded: true },
          { aliasPath: 'organizations', isIncluded: true },
        ],
      } as never);

      return {
        mainTableReference: `\`${eventsFQN}\``,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: bridgeRelationship('rel-users', 'users', [
              { sourceFieldName: 'user_id', targetFieldName: 'userId' },
            ]),
            targetTableReference: `\`${usersFQN}\``,
            parentAlias: 'main',
            cteName: 'users',
            blendedFields: [
              {
                targetFieldName: 'country',
                outputAlias: 'users__country',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Users',
            targetDataMartUrl: 'http://x/users',
          },
          {
            relationship: bridgeRelationship('rel-organizations', 'organizations', [
              { sourceFieldName: 'org_id', targetFieldName: 'orgId' },
            ]),
            targetTableReference: `\`${organizationsFQN}\``,
            parentAlias: 'main',
            cteName: 'organizations',
            blendedFields: [
              {
                targetFieldName: 'orgId',
                outputAlias: 'organizations__orgId',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Organizations',
            targetDataMartUrl: 'http://x/organizations',
          },
        ],
        columns: ['users__country', 'organizations__orgId'],
        aggregations: [{ column: 'organizations__orgId', function: 'COUNT_DISTINCT' }],
        fieldIndex,
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
      eventsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sibling_events_${stamp}`;
      usersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sibling_users_${stamp}`;
      organizationsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sibling_organizations_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${eventsFQN}\` (event_id STRING, user_id STRING, org_id STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${eventsFQN}\` (event_id, user_id, org_id) VALUES
        ('e1','u1','o1'), ('e2','u1','o1'), ('e3','u2','o1'),
        ('e4','u3','o2'), ('e5','u3','o2'),
        ('e6','u4','o3'), ('e7','u4','o3'), ('e8','u5','o3')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${usersFQN}\` (userId STRING, country STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${usersFQN}\` (userId, country) VALUES
        ('u1','US'), ('u2','US'), ('u3','DE'), ('u4','UA'), ('u5','PL')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${organizationsFQN}\` (orgId STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${organizationsFQN}\` (orgId) VALUES ('o1'), ('o2'), ('o3')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, usersFQN, organizationsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop sibling table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('fan-out: joined COUNT DISTINCT is correct through a sibling bridge (non-regression): US=1, DE=1, UA=1, PL=1', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(4);
      const byCountry = new Map(
        rows.map(r => [String(r.users__country), Number(r['organizations__orgId | COUNTUNIQUE'])])
      );

      expect(byCountry.get('US')).toBe(1);
      expect(byCountry.get('DE')).toBe(1);
      expect(byCountry.get('UA')).toBe(1);
      expect(byCountry.get('PL')).toBe(1);
    }, 120000);

    it('grand total (no grouping) stays correct through the sibling bridge: 3 distinct orgs (o3 shared by UA+PL, not double-counted)', async () => {
      const context = bridgeContext();
      context.columns = ['organizations__orgId']; // dimensionless: no report GROUP BY
      const rows = await runBlend(context);

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['organizations__orgId | COUNTUNIQUE'])).toBe(3);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM/AVG through a bridge — value sleeve set-based proof (4,
// real BigQuery). Proves the value-carrying metric sleeve (C2.1-C2.3) returns
// the SET-BASED correct SUM/AVG through a bridge, not the naive dedup+re-agg
// over-count / avg-of-avgs a pre-sleeve build would have produced.
//
// Topology: main = items (an order/product bridge table, one row per
// order-product pair — the same fan-out shape as the metric-sleeve prototype,
// tmp/mcp/tasks/6766-symmetric-aggregates-fanout/6766_bridge_prototype.sql).
// TWO sibling chains off main: products (dimension: category) and orders
// (metric: revenue, aggregated post-join as SUM/AVG).
//
// Seed (same values as the proven prototype — see 2026-07-28-aggregation-matrix.md
// and 2026-07-29-c2-design-sum-avg-value-sleeve.md: "BQ-proven: naive SUM 200 /
// AVG 66.67 vs set-based 150 / AVG 75"):
//   orders(orderId, revenue):      o1=100, o2=50, o3=30
//   products(productId, category): pA=Supplements, pB=Supplements, pC=Gear
//   items(itemId, orderId, productId):
//     i1 o1 pA · i2 o1 pC   (o1 touches BOTH categories)
//     i3 o2 pA · i4 o2 pB   (o2 touches Supplements via TWO products — the fan-out)
//     i5 o3 pC
//
// Ground truth per category (an order's revenue counts ONCE per category it
// touches, no matter how many of that category's products it bought):
//   Supplements: orders {o1, o2} → SUM = 100 + 50 = 150; AVG = 150 / 2 = 75
//   Gear:        orders {o1, o3} → SUM = 100 + 30 = 130; AVG = 130 / 2 = 65
//
// NAIVE (dedup-then-re-aggregate over the flat join, the pre-sleeve mechanism)
// would have returned, for Supplements — o2 appears TWICE there (via pA AND
// pB), so:
//   naive SUM = 100 (o1 via i1) + 50 (o2 via i3) + 50 (o2 via i4) = 200 (WRONG — double-counts o2)
//   naive AVG = 200 / 3 = 66.67 (WRONG — averages 3 item-rows instead of 2 distinct orders)
// Gear has no repeated order per category (o1 and o3 each appear once via
// pC), so naive and correct COINCIDE there (130 / 65) — Gear is the CONTROL
// group, proving the sleeve does not distort a group that never fans out.
describeIfCredentials('Blended SUM/AVG through a bridge — value sleeve (4, real BigQuery)', () => {
  let adapter: BigQueryApiAdapter;
  let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
  let config: BigQueryConfig;
  let itemsFQN: string;
  let ordersFQN: string;
  let productsFQN: string;

  const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

  function bridgeRelationship(
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

  // main -> products (dimension: category) AND main -> orders (metric: SUM/AVG
  // revenue) — BOTH chains are roots off main (siblings), mirroring the
  // orders/order_items/products bridge shape from the prototype.
  function bridgeContext(fn: 'SUM' | 'AVG'): BlendedQueryContext {
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'products__category',
          aliasPath: 'products',
          originalFieldName: 'category',
          type: 'STRING',
        },
        {
          name: 'orders__revenue',
          aliasPath: 'orders',
          originalFieldName: 'revenue',
          type: 'NUMERIC',
        },
      ],
      availableSources: [
        { aliasPath: 'products', isIncluded: true },
        { aliasPath: 'orders', isIncluded: true },
      ],
    } as never);

    return {
      mainTableReference: `\`${itemsFQN}\``,
      mainDataMartTitle: 'Items',
      mainDataMartUrl: 'http://x/items',
      chains: [
        {
          relationship: bridgeRelationship('rel-products', 'products', [
            { sourceFieldName: 'productId', targetFieldName: 'productId' },
          ]),
          targetTableReference: `\`${productsFQN}\``,
          parentAlias: 'main',
          cteName: 'products',
          blendedFields: [
            {
              targetFieldName: 'category',
              outputAlias: 'products__category',
              isHidden: false,
              aggregateFunction: 'ANY_VALUE',
            },
          ],
          targetDataMartTitle: 'Products',
          targetDataMartUrl: 'http://x/products',
        },
        {
          relationship: bridgeRelationship('rel-orders', 'orders', [
            { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
          ]),
          targetTableReference: `\`${ordersFQN}\``,
          parentAlias: 'main',
          cteName: 'orders',
          blendedFields: [
            {
              targetFieldName: 'revenue',
              outputAlias: 'orders__revenue',
              isHidden: false,
              aggregateFunction: 'ANY_VALUE',
            },
          ],
          targetDataMartTitle: 'Orders',
          targetDataMartUrl: 'http://x/orders',
        },
      ],
      columns: ['products__category', 'orders__revenue'],
      aggregations: [{ column: 'orders__revenue', function: fn }],
      fieldIndex,
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
    itemsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sumavg_bridge_items_${stamp}`;
    ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sumavg_bridge_orders_${stamp}`;
    productsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sumavg_bridge_products_${stamp}`;

    await adapter.executeQuery(
      `CREATE TABLE \`${itemsFQN}\` (itemId STRING, orderId STRING, productId STRING)`
    );
    await adapter.executeQuery(
      `INSERT INTO \`${itemsFQN}\` (itemId, orderId, productId) VALUES
        ('i1','o1','pA'), ('i2','o1','pC'),
        ('i3','o2','pA'), ('i4','o2','pB'),
        ('i5','o3','pC')`
    );

    await adapter.executeQuery(`CREATE TABLE \`${ordersFQN}\` (orderId STRING, revenue NUMERIC)`);
    await adapter.executeQuery(
      `INSERT INTO \`${ordersFQN}\` (orderId, revenue) VALUES
        ('o1', 100), ('o2', 50), ('o3', 30)`
    );

    await adapter.executeQuery(
      `CREATE TABLE \`${productsFQN}\` (productId STRING, category STRING)`
    );
    await adapter.executeQuery(
      `INSERT INTO \`${productsFQN}\` (productId, category) VALUES
        ('pA','Supplements'), ('pB','Supplements'), ('pC','Gear')`
    );
  }, 180000);

  afterAll(async () => {
    for (const fqn of [itemsFQN, ordersFQN, productsFQN]) {
      try {
        await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
      } catch (error) {
        console.warn(`Failed to drop value-sleeve bridge table ${fqn}:`, error);
      }
    }
  }, 60000);

  it('fan-out: joined SUM through the bridge is set-based correct: Supplements=150 (not naive 200), Gear=130', async () => {
    const rows = await runBlend(bridgeContext('SUM'));

    expect(rows).toHaveLength(2);
    const byCategory = new Map(
      rows.map(r => [String(r.products__category), Number(r['orders__revenue | SUM'])])
    );

    // Headline case: o2 fans out across TWO Supplements products (pA, pB) — the
    // sleeve must count o2's $50 ONCE, not twice (naive dedup+re-agg would return 200).
    expect(byCategory.get('Supplements')).toBe(150);
    // Control: Gear has no repeated order per category, so naive and correct
    // coincide — proves the sleeve doesn't distort a group that never fans out.
    expect(byCategory.get('Gear')).toBe(130);
  }, 120000);

  it('fan-out: joined AVG through the bridge is set-based correct: Supplements=75 (not naive avg-of-3-rows 66.67), Gear=65', async () => {
    const rows = await runBlend(bridgeContext('AVG'));

    expect(rows).toHaveLength(2);
    const byCategory = new Map(
      rows.map(r => [String(r.products__category), Number(r['orders__revenue | AVG'])])
    );

    expect(byCategory.get('Supplements')).toBe(75);
    expect(byCategory.get('Gear')).toBe(65);
  }, 120000);

  // requesting BOTH SUM and AVG on the SAME joined column now merges into
  // ONE sleeve CTE instead of two identical dedup passes (C3.1, a pure efficiency
  // optimization). This proves on REAL BigQuery that the merge did not change either
  // number — SUM and AVG must still be the exact set-based values proven above (150/75
  // for Supplements, 130/65 for Gear) — and that the merge actually happened: the
  // generated SQL must contain exactly ONE `sleeve_orders__revenue` CTE (one
  // `SELECT DISTINCT` dedup pass) feeding both aggregates, not two.
  it('2 merged sleeve: SUM AND AVG on the same joined column share ONE sleeve_<col> CTE and both stay set-based correct: Supplements SUM=150/AVG=75, Gear SUM=130/AVG=65', async () => {
    const context: BlendedQueryContext = {
      ...bridgeContext('SUM'),
      aggregations: [
        { column: 'orders__revenue', function: 'SUM' },
        { column: 'orders__revenue', function: 'AVG' },
      ],
    };
    const { sql, params } = builder.buildBlendedQuery(context);

    // The merge: exactly one merged sleeve CTE for orders__revenue — a
    // pre-C3.1 build would have emitted two (`sleeve_orders__revenue` +
    // `sleeve_orders__revenue_SUM`/`_AVG`-style collision-avoided names).
    expect(sql.match(/sleeve_orders__revenue AS \(/g)).toHaveLength(1);
    expect(sql.match(/SELECT DISTINCT/g)).toHaveLength(1);
    expect(sql.match(/LEFT JOIN sleeve_orders__revenue ON/g)).toHaveLength(1);

    const { jobId } = await adapter.executeQuery(sql, params);
    const job = await adapter.getJob(jobId);
    const destinationTable = job.metadata.configuration.query.destinationTable;
    const table = adapter.createTableReference(
      destinationTable.projectId,
      destinationTable.datasetId,
      destinationTable.tableId
    );
    const [rows] = await table.getRows({ maxResults: 5000, autoPaginate: false });

    expect(rows).toHaveLength(2);
    const byCategory = new Map(
      (rows as Record<string, unknown>[]).map(r => [String(r.products__category), r])
    );

    const supplements = byCategory.get('Supplements')!;
    expect(Number(supplements['orders__revenue | SUM'])).toBe(150);
    expect(Number(supplements['orders__revenue | AVG'])).toBe(75);

    const gear = byCategory.get('Gear')!;
    expect(Number(gear['orders__revenue | SUM'])).toBe(130);
    expect(Number(gear['orders__revenue | AVG'])).toBe(65);
  }, 120000);
});

// ---------------------------------------------------------------------------
// sleeve honours post-join FILTERS (C1) and the outer dimension GRAIN
// for a FANNING blended dimension (C2), real BigQuery. Both defects made the
// sleeve silently disagree with the outer query; prior fixtures were all
// 1-row-per-key with no filter, which hid them.
//
// Topology: main = events; two sibling chains off main —
//   labels  (main.dimKey = labels.dimKey)  — dimension, roll-up = STRING_AGG
//   orders  (main.orderId = orders.orderId) — metric owner (SUM + COUNT_DISTINCT)
//
// The `labels` chain FANS: dimKey k1 owns TWO label rows (red, blue), so its
// dedup CTE rolls them up (STRING_AGG → 'blue, red' — one value per dimKey).
// The report groups by that rolled-up label. Pre-C2 the sleeve projected the
// RAW label ('red'/'blue'), which never equalled the outer roll-up ('blue, red')
// → NULL-safe join-back never matched → NULL metric. The fix builds the sleeve's
// dimension from the SAME dedup-CTE ref the outer GROUP BY uses.
//
// A third main row (ev4) points at a dimKey with NO labels row at all, so the
// LEFT JOIN leaves the report dimension NULL — the live exercise of
// `renderNullSafeJoinOn`'s `IS NULL AND IS NULL` leg ( M6). A plain
// `=` join-back drops that bucket's metrics (NULL, or 0 once a COUNT DISTINCT
// pull coalesces), so the NULL group is where the sleeve is easiest to get wrong.
//
// Seed:
//   orders(orderId, revenue):  o1=100, o2=50, o3=30, o4=70
//   labels(dimKey, label):     k1→red, k1→blue  (FANS)   ·  k2→green   ·  (no k3 row)
//   events(eventId, dimKey, orderId, country):
//     ev1 k1 o1 US · ev2 k1 o2 DE · ev3 k2 o3 US · ev4 k3 o4 US
//
// Ground truth — group by the rolled-up label, distinct orders per bucket:
//   UNFILTERED (C2 proof, both metrics NON-NULL & correct):
//     'blue, red' (k1): orders {o1,o2} → SUM 150, COUNT_DISTINCT 2
//     'green'     (k2): order  {o3}    → SUM  30, COUNT_DISTINCT 1
//     NULL        (k3): order  {o4}    → SUM  70, COUNT_DISTINCT 1
//   FILTERED country='US' (C1 proof — a NON-dimension column; ev2/DE drops out):
//     'blue, red' (k1): order  {o1}    → SUM 100, COUNT_DISTINCT 1  (NOT the unfiltered 150/2)
//     'green'     (k2): order  {o3}    → SUM  30, COUNT_DISTINCT 1
//     NULL        (k3): order  {o4}    → SUM  70, COUNT_DISTINCT 1  (ev4 is US)
// A sleeve that ignored the filter (C1 bug) would return the unfiltered 150/2
// for the 'blue, red' bucket even under the country='US' report.
describeIfCredentials(
  'sleeve honours post-join filters + fanning blended dimension (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let eventsFQN: string;
    let labelsFQN: string;
    let ordersFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function rel(
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

    // dimension: labels__label (STRING_AGG roll-up — the fanning dimension);
    // metrics: orders__revenue (SUM) and orders__orderId (COUNT_DISTINCT).
    function fanningContext(filters?: BlendedQueryContext['filters']): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'labels__label',
            aliasPath: 'labels',
            originalFieldName: 'label',
            type: 'STRING',
          },
          {
            name: 'orders__revenue',
            aliasPath: 'orders',
            originalFieldName: 'revenue',
            type: 'NUMERIC',
          },
          {
            name: 'orders__orderId',
            aliasPath: 'orders',
            originalFieldName: 'orderId',
            type: 'STRING',
          },
        ],
        availableSources: [
          { aliasPath: 'labels', isIncluded: true },
          { aliasPath: 'orders', isIncluded: true },
        ],
      } as never);

      return {
        mainTableReference: `\`${eventsFQN}\``,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: rel('rel-labels', 'labels', [
              { sourceFieldName: 'dimKey', targetFieldName: 'dimKey' },
            ]),
            targetTableReference: `\`${labelsFQN}\``,
            parentAlias: 'main',
            cteName: 'labels',
            blendedFields: [
              {
                targetFieldName: 'label',
                outputAlias: 'labels__label',
                isHidden: false,
                // STRING_AGG: the fanning dimension rolls up to 'blue, red' per dimKey — the
                // NON-identity roll-up that exposes C2.
                aggregateFunction: 'STRING_AGG',
              },
            ],
            targetDataMartTitle: 'Labels',
            targetDataMartUrl: 'http://x/labels',
          },
          {
            relationship: rel('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: `\`${ordersFQN}\``,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'revenue',
                outputAlias: 'orders__revenue',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
              {
                targetFieldName: 'orderId',
                outputAlias: 'orders__orderId',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
          },
        ],
        columns: ['labels__label', 'orders__revenue', 'orders__orderId'],
        aggregations: [
          { column: 'orders__revenue', function: 'SUM' },
          { column: 'orders__orderId', function: 'COUNT_DISTINCT' },
        ],
        filters,
        columnTypes: {
          postJoin: new Map([
            ['labels__label', 'STRING'],
            ['orders__revenue', 'NUMERIC'],
            ['orders__orderId', 'STRING'],
            ['country', 'STRING'],
          ]),
        },
        fieldIndex,
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

    // The rolled-up label ('blue, red') order is not guaranteed by STRING_AGG, so identify the
    // fanning bucket as the one that is neither the lone 'green' row nor the NULL-label row.
    function fanningRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => r.labels__label != null && String(r.labels__label) !== 'green')!;
    }
    function greenRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => String(r.labels__label) === 'green')!;
    }
    // The k3 bucket: no labels row, so the LEFT JOIN leaves the dimension NULL.
    function nullLabelRow(rows: Record<string, unknown>[]): Record<string, unknown> {
      return rows.find(r => r.labels__label == null)!;
    }

    beforeAll(async () => {
      const credentials = BigQueryServiceAccountCredentialsSchema.parse(
        JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
      );
      const config: BigQueryConfig = {
        projectId: BQ_PROJECT_ID!,
        location: BIGQUERY_AUTODETECT_LOCATION,
      };
      adapter = new BigQueryApiAdapter(credentials, config);

      const stamp = `${Date.now()}`;
      eventsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.r1_events_${stamp}`;
      labelsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.r1_labels_${stamp}`;
      ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.r1_orders_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${eventsFQN}\` (eventId STRING, dimKey STRING, orderId STRING, country STRING)`
      );
      // ev4 → dimKey 'k3', which has NO labels row: the LEFT JOIN yields a NULL dimension.
      await adapter.executeQuery(
        `INSERT INTO \`${eventsFQN}\` (eventId, dimKey, orderId, country) VALUES
        ('ev1','k1','o1','US'), ('ev2','k1','o2','DE'), ('ev3','k2','o3','US'), ('ev4','k3','o4','US')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${labelsFQN}\` (dimKey STRING, label STRING)`);
      // k1 owns TWO labels (red, blue) — the fan-out that makes the dedup roll-up non-identity.
      await adapter.executeQuery(
        `INSERT INTO \`${labelsFQN}\` (dimKey, label) VALUES
        ('k1','red'), ('k1','blue'), ('k2','green')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${ordersFQN}\` (orderId STRING, revenue NUMERIC)`);
      await adapter.executeQuery(
        `INSERT INTO \`${ordersFQN}\` (orderId, revenue) VALUES
        ('o1', 100), ('o2', 50), ('o3', 30), ('o4', 70)`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, labelsFQN, ordersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop R1 fixture table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('a FANNING blended dimension returns correct NON-NULL per-group SUM and COUNT_DISTINCT (blue,red=150/2, green=30/1)', async () => {
      const rows = await runBlend(fanningContext());

      expect(rows).toHaveLength(3);
      const fan = fanningRow(rows); // the rolled-up 'blue, red' bucket (k1)
      const green = greenRow(rows);

      // The rolled-up label bucket actually combines red + blue (proves it is the roll-up, not
      // a single raw value).
      expect(String(fan.labels__label)).toContain('red');
      expect(String(fan.labels__label)).toContain('blue');

      // C2: both metrics land on the rolled-up bucket (NULL pre-fix, because the sleeve
      // projected the raw label which never matched the outer 'blue, red').
      expect(Number(fan['orders__revenue | SUM'])).toBe(150);
      expect(Number(fan['orders__orderId | COUNTUNIQUE'])).toBe(2);
      expect(Number(green['orders__revenue | SUM'])).toBe(30);
      expect(Number(green['orders__orderId | COUNTUNIQUE'])).toBe(1);
    }, 120000);

    // M6: `renderNullSafeJoinOn` exists for exactly this bucket, and until now no
    // test ever fed it a real NULL. On a plain `=` join-back the k3 group's metrics come back
    // NULL (SUM) and 0 (COUNT DISTINCT, post-COALESCE) while the row itself still shows up —
    // silently wrong rather than missing.
    it('fan-out: M6: a NULL dimension group (no joined row) still gets its sleeve metrics via the NULL-safe join-back: SUM=70, COUNT_DISTINCT=1', async () => {
      const rows = await runBlend(fanningContext());

      const nullRow = nullLabelRow(rows);
      expect(nullRow).toBeDefined();
      expect(nullRow.labels__label).toBeNull();
      expect(Number(nullRow['orders__revenue | SUM'])).toBe(70);
      expect(Number(nullRow['orders__orderId | COUNTUNIQUE'])).toBe(1);
    }, 120000);

    it('a post-join filter on a NON-dimension column (country=US) is applied INSIDE the sleeve — metrics over the FILTERED set (blue,red=100/1, not 150/2)', async () => {
      const rows = await runBlend(
        fanningContext([
          { column: 'country', operator: 'eq', value: 'US', placement: 'post-join' },
        ] as never)
      );

      expect(rows).toHaveLength(3);
      const fan = fanningRow(rows);
      const green = greenRow(rows);
      const nullRow = nullLabelRow(rows);
      // The NULL bucket survives the filter (ev4 is US) — NULL-safe join-back under a WHERE.
      expect(Number(nullRow['orders__revenue | SUM'])).toBe(70);
      expect(Number(nullRow['orders__orderId | COUNTUNIQUE'])).toBe(1);

      // C1: ev2 (DE, order o2=$50) is filtered out, so the 'blue, red' bucket drops to the
      // single US order o1 — SUM 100 / COUNT 1, NOT the unfiltered 150 / 2 a sleeve that
      // ignored the WHERE would return.
      expect(Number(fan['orders__revenue | SUM'])).toBe(100);
      expect(Number(fan['orders__orderId | COUNTUNIQUE'])).toBe(1);
      // 'green' (k2, order o3=$30, event ev3 is US) is untouched by the filter.
      expect(Number(green['orders__revenue | SUM'])).toBe(30);
      expect(Number(green['orders__orderId | COUNTUNIQUE'])).toBe(1);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM through a simple 1-to-many join — value-sleeve routing stays
// exact (4, real BigQuery). C2.3 routes ALL joined SUM/AVG through
// the value sleeve uniformly, including the simple 1-to-many case that the
// OLD additive dedup+SUM path already computed correctly (one order -> many
// child items, value lives on the CHILD/"many" side, no bridge/fan-out of a
// shared owner across report rows). This is a ROUTING sanity check, not a
// bug guard: it proves the sleeve's `DISTINCT (dim, __owox_rid, value)` does not
// collapse or distort anything when every raw child row is already a
// genuinely distinct value contributor — the sleeve SUM must equal the plain
// additive SUM.
//
// Topology: main = orders (orderId, country — the "one" side); one sibling
// chain off main: items (order_id, price — the "many" child side, no
// children of its own). Dimension = orders.country (a plain MAIN-native
// column, not blended). Metric = SUM(items.price).
//
// Seed:
//   orders(orderId, country): o1=US, o2=US, o3=DE
//   items(itemId, order_id, price): it1 o1 $10 · it2 o1 $15 · it3 o2 $20 ·
//                                   it4 o3 $5  · it5 o3 $5
//
// Ground truth (plain additive SUM per country — no owner is ever reachable
// via more than one item row, and no two item rows are ever the SAME raw
// row, so nothing should be deduped away):
//   US = 10 + 15 + 20 = 45
//   DE = 5 + 5 = 10   (two DIFFERENT $5 items — the value-sleeve surrogate
//                      must NOT collapse them just because their values match)
// A naive/pre-sleeve additive SUM would have returned the SAME 45 / 10 — this
// case exists to prove the C2.3 routing change didn't regress it, not to fix
// a bug.
describeIfCredentials(
  'Blended SUM through a simple 1-to-many join — value sleeve stays exact (4, real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let ordersFQN: string;
    let itemsFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function bridgeRelationship(
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

    // main -> items (metric: SUM price), value lives on the CHILD/"many" side.
    // Dimension (country) is a plain main-native column — no fieldIndex entry.
    function oneToManyContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'items__price',
            aliasPath: 'items',
            originalFieldName: 'price',
            type: 'NUMERIC',
          },
        ],
        availableSources: [{ aliasPath: 'items', isIncluded: true }],
      } as never);

      return {
        mainTableReference: `\`${ordersFQN}\``,
        mainDataMartTitle: 'Orders',
        mainDataMartUrl: 'http://x/orders',
        chains: [
          {
            relationship: bridgeRelationship('rel-items', 'items', [
              { sourceFieldName: 'orderId', targetFieldName: 'order_id' },
            ]),
            targetTableReference: `\`${itemsFQN}\``,
            parentAlias: 'main',
            cteName: 'items',
            blendedFields: [
              {
                targetFieldName: 'price',
                outputAlias: 'items__price',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Items',
            targetDataMartUrl: 'http://x/items',
          },
        ],
        columns: ['country', 'items__price'],
        aggregations: [{ column: 'items__price', function: 'SUM' }],
        fieldIndex,
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
      ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sumavg_1tomany_orders_${stamp}`;
      itemsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sumavg_1tomany_items_${stamp}`;

      await adapter.executeQuery(`CREATE TABLE \`${ordersFQN}\` (orderId STRING, country STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${ordersFQN}\` (orderId, country) VALUES
        ('o1','US'), ('o2','US'), ('o3','DE')`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${itemsFQN}\` (itemId STRING, order_id STRING, price NUMERIC)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${itemsFQN}\` (itemId, order_id, price) VALUES
        ('it1','o1',10), ('it2','o1',15), ('it3','o2',20),
        ('it4','o3',5), ('it5','o3',5)`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [ordersFQN, itemsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop 1-to-many table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('fan-out: joined SUM over a simple 1-to-many child value stays exact: US=45, DE=10 (two distinct $5 items both count)', async () => {
      const rows = await runBlend(oneToManyContext());

      expect(rows).toHaveLength(2);
      const byCountry = new Map(
        rows.map(r => [String(r.country), Number(r['items__price | SUM'])])
      );

      expect(byCountry.get('US')).toBe(45);
      expect(byCountry.get('DE')).toBe(10);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM through a bridge — no-PK synthetic surrogate (4, real
// BigQuery). Proves the matrix's §3 no-PK fallback: WITHOUT a declared
// primary key on the value's owner DM, the synthetic per-raw-row surrogate
// (`buildRowSurrogate`/`__owox_rid`, C2.1) still identifies genuinely-distinct
// owner rows correctly, even when two of them happen to carry the SAME
// value. This slice does not read a declared PK at all (see C2.1's decision)
// — every owner row always gets the synthetic surrogate — so this is the
// mechanism this whole task proves, exercised directly.
//
// Topology: main = items (a bridge fact table), one chain off main: orders
// (metric: SUM amount, dimensionless grand total — no report GROUP BY).
//
// Seed — two DIFFERENT orders, A and B, both worth exactly $50; A is reached
// through the bridge TWICE (fanned), B once:
//   orders(orderId, amount): A=50, B=50
//   items(itemId, orderId):  i1->A, i2->A (A fans out), i3->B
//
// Ground truth: A and B are genuinely distinct orders — the grand total must
// count EACH ONCE: 50 + 50 = 100.
//
// The two WRONG alternatives this disambiguates (matrix §3):
//   naive additive SUM (join-then-sum, no owner-identity dedup at all) =
//     50 (i1->A) + 50 (i2->A) + 50 (i3->B) = 150 — OVER-counts A's fanned rows.
//   naive "DISTINCT by value" (dedup on value alone, no owner id) collapses
//     A's $50 and B's $50 into a single distinct value = 50 — UNDER-counts by
//     conflating two different orders that happen to share a price.
//   Only owner-identity (the synthetic surrogate) gets it right: 100.
describeIfCredentials(
  'Blended SUM through a bridge — no-PK synthetic surrogate (4, real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let itemsFQN: string;
    let ordersFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function bridgeRelationship(
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

    function bridgeContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__amount',
            aliasPath: 'orders',
            originalFieldName: 'amount',
            type: 'NUMERIC',
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never);

      return {
        mainTableReference: `\`${itemsFQN}\``,
        mainDataMartTitle: 'Items',
        mainDataMartUrl: 'http://x/items',
        chains: [
          {
            relationship: bridgeRelationship('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: `\`${ordersFQN}\``,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'amount',
                outputAlias: 'orders__amount',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
          },
        ],
        columns: ['orders__amount'], // dimensionless: no report GROUP BY
        aggregations: [{ column: 'orders__amount', function: 'SUM' }],
        fieldIndex,
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
      itemsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sumavg_nopk_items_${stamp}`;
      ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.sumavg_nopk_orders_${stamp}`;

      await adapter.executeQuery(`CREATE TABLE \`${itemsFQN}\` (itemId STRING, orderId STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${itemsFQN}\` (itemId, orderId) VALUES
        ('i1','A'), ('i2','A'), ('i3','B')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${ordersFQN}\` (orderId STRING, amount NUMERIC)`);
      await adapter.executeQuery(
        `INSERT INTO \`${ordersFQN}\` (orderId, amount) VALUES ('A', 50), ('B', 50)`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [itemsFQN, ordersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop no-PK surrogate table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('fan-out: no-PK synthetic surrogate: two distinct $50 orders (one fanned) sum to 100, not naive 150 or dedup-by-value 50', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['orders__amount | SUM'])).toBe(100);
    }, 120000);
  }
);

// Blended SUM through a NON-identity pre-join aggregate — value sleeve carries the
// dedup CTE's ALREADY-aggregated column (/C3, "funnel" shape, real
// BigQuery). Proves the R2 fix: a blended field whose OWN pre-join `aggregateFunction`
// is a real aggregate (here COUNT_DISTINCT, not the raw ANY_VALUE passthrough every
// other fixture uses) must have its post-join value sleeve read the OWNER's OWN
// dedup CTE column (one value per pre-join GROUP KEY), not the raw column keyed by the
// per-raw-row surrogate. Pre-R2 this would have summed RAW hit ids — on this STRING id
// shape that is a hard BigQuery type error ("No matching signature for aggregate
// function SUM for argument types: STRING"); on a numeric id it would silently sum the
// wrong (raw, pre-dedup) numbers.
//
// Topology: main = sessions (session_id, campaign). ONE chain off main: hits
// (session_id, hit_id — hit_id is STRING, the real-world shape), blended field
// `hits__hit_id` with pre-join aggregateFunction COUNT_DISTINCT — i.e. the dedup CTE
// computes `COUNT(DISTINCT hit_id)` PER session (the join key), not a raw passthrough.
//
// Seed (hit_id repeats WITHIN a session — e.g. a retried/duplicate event — so the
// pre-join COUNT_DISTINCT genuinely dedupes something):
//   sessions(session_id, campaign): s1=A, s2=A, s3=B
//   hits(session_id, hit_id):
//     s1: h1, h1, h2   (distinct hit ids = 2)
//     s2: h3, h4, h5   (distinct hit ids = 3)
//     s3: h6, h6       (distinct hit ids = 1)
//
// Ground truth (hand-computed): SUM, per campaign, of each session's OWN distinct-hit
// count — NOT a sum of raw hit rows/ids:
//   campaign A: sessions {s1, s2} -> 2 + 3 = 5
//   campaign B: session  {s3}     -> 1
describeIfCredentials(
  'Blended SUM through a non-identity pre-join aggregate — value sleeve (/C3, funnel, real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let sessionsFQN: string;
    let hitsFQN: string;

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

    function funnelContext(): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'hits__hit_id',
            aliasPath: 'hits',
            originalFieldName: 'hit_id',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'hits', isIncluded: true }],
      } as never);

      return {
        mainTableReference: `\`${sessionsFQN}\``,
        mainDataMartTitle: 'Sessions',
        mainDataMartUrl: 'http://x/sessions',
        chains: [
          {
            relationship: funnelRelationship('rel-hits', 'hits', [
              { sourceFieldName: 'session_id', targetFieldName: 'session_id' },
            ]),
            targetTableReference: `\`${hitsFQN}\``,
            parentAlias: 'main',
            cteName: 'hits',
            blendedFields: [
              {
                targetFieldName: 'hit_id',
                outputAlias: 'hits__hit_id',
                isHidden: false,
                aggregateFunction: 'COUNT_DISTINCT',
              },
            ],
            targetDataMartTitle: 'Hits',
            targetDataMartUrl: 'http://x/hits',
          },
        ],
        columns: ['campaign', 'hits__hit_id'],
        aggregations: [{ column: 'hits__hit_id', function: 'SUM' }],
        fieldIndex,
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
      sessionsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.funnel_sessions_${stamp}`;
      hitsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.funnel_hits_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${sessionsFQN}\` (session_id STRING, campaign STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${sessionsFQN}\` (session_id, campaign) VALUES
        ('s1','A'), ('s2','A'), ('s3','B')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${hitsFQN}\` (session_id STRING, hit_id STRING)`);
      await adapter.executeQuery(
        `INSERT INTO \`${hitsFQN}\` (session_id, hit_id) VALUES
        ('s1','h1'), ('s1','h1'), ('s1','h2'),
        ('s2','h3'), ('s2','h4'), ('s2','h5'),
        ('s3','h6'), ('s3','h6')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [sessionsFQN, hitsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop funnel table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('/ joined SUM over a non-identity pre-join COUNT_DISTINCT is the sum of PER-SESSION distinct hit counts: A=5, B=1 (not a raw-id sum/type error)', async () => {
      const context = funnelContext();
      const { sql } = builder.buildBlendedQuery(context);

      // The sleeve reads the dedup CTE's own aggregated column, keyed by the pre-join
      // group key — never the raw `hits_raw.hit_id` column (which would either type-error
      // on this STRING id or silently sum the wrong, pre-dedup numbers).
      expect(sql).toContain('hits.hits__hit_id');
      expect(sql).not.toContain('hits_raw.hit_id');

      const rows = await runBlend(context);

      expect(rows).toHaveLength(2);
      const byCampaign = new Map(
        rows.map(r => [String(r.campaign), Number(r['hits__hit_id | SUM'])])
      );

      expect(byCampaign.get('A')).toBe(5);
      expect(byCampaign.get('B')).toBe(1);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// a Totals (grand-total, dimensionless) COUNT_DISTINCT sleeve pull reads 0,
// not NULL, when the report's WHERE matches no rows (real BigQuery).
//
// The grand-total sleeve pull was `ANY_VALUE(sleeve.alias)` with no COALESCE. The sleeve's
// OWN internal `COUNT(DISTINCT ...)` (no GROUP BY at the grand-total grain) correctly
// evaluates to 0 over its own zero filtered rows — COUNT is a counting function, 0 over
// zero rows, never NULL. But a WHERE that matches nothing filters out every row of `main` in
// the OUTER query too, so the CROSS JOIN with the sleeve CTE contributes ZERO rows to the
// outer aggregate — and ANY_VALUE, like AVG, returns NULL over an empty input set. The
// outer pull then loses the sleeve's already-correct 0 and reports NULL instead. A Totals
// COUNT_DISTINCT for a filter that legitimately matches nothing (e.g. a narrow date range)
// must still read 0, matching the pre-sleeve (COUNT-based) behaviour.
//
// Topology: main = events (eventId, orderId, country). One chain off main: orders
// (orderId — the join key), blended field orders__orderId (ANY_VALUE passthrough) used as
// the report's joined COUNT_DISTINCT metric. Totals mode: `columns` carries ONLY the
// aggregated column, so the aggregated query has no GROUP BY (dimensionless).
//
// Seed: events(eventId, orderId, country): ev1 o1 US · ev2 o2 DE. The report filters
// country='ZZ' — a value that matches neither row.
describeIfCredentials(
  '— Totals COUNT_DISTINCT reads 0, not NULL, when the filter matches nothing (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let eventsFQN: string;
    let ordersFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function totalsRelationship(
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

    // Dimensionless (Totals) context: `columns` carries ONLY the aggregated column, so no
    // outer GROUP BY is emitted. `filters` matches nothing when `country` is 'ZZ'.
    function totalsContext(filters?: BlendedQueryContext['filters']): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__orderId',
            aliasPath: 'orders',
            originalFieldName: 'orderId',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never);

      return {
        mainTableReference: `\`${eventsFQN}\``,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: totalsRelationship('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: `\`${ordersFQN}\``,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'orderId',
                outputAlias: 'orders__orderId',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
          },
        ],
        columns: ['orders__orderId'], // dimensionless: no report GROUP BY
        aggregations: [{ column: 'orders__orderId', function: 'COUNT_DISTINCT' }],
        filters,
        columnTypes: {
          postJoin: new Map([
            ['country', 'STRING'],
            ['weight', 'INTEGER'],
            ['eventDate', 'DATE'],
          ]),
        },
        fieldIndex,
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
      eventsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.f3_empty_events_${stamp}`;
      ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.f3_empty_orders_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${eventsFQN}\` (eventId STRING, orderId STRING, country STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${eventsFQN}\` (eventId, orderId, country) VALUES
        ('ev1','o1','US'), ('ev2','o2','DE')`
      );

      await adapter.executeQuery(`CREATE TABLE \`${ordersFQN}\` (orderId STRING)`);
      await adapter.executeQuery(`INSERT INTO \`${ordersFQN}\` (orderId) VALUES ('o1'), ('o2')`);
    }, 180000);

    afterAll(async () => {
      for (const fqn of [eventsFQN, ordersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop F3 empty-result table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('sanity: UNFILTERED Totals COUNT_DISTINCT is 2 (both orders match)', async () => {
      const rows = await runBlend(totalsContext());

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['orders__orderId | COUNTUNIQUE'])).toBe(2);
    }, 120000);

    it("sleeve: a WHERE that matches NOTHING (country='ZZ') returns Totals COUNT_DISTINCT = 0, not NULL", async () => {
      const rows = await runBlend(
        totalsContext([
          { column: 'country', operator: 'eq', value: 'ZZ', placement: 'post-join' },
        ] as never)
      );

      // The aggregate query has no GROUP BY, so it still collapses to exactly one row even
      // though the WHERE matched zero source rows — the classic single-row-aggregate-over-
      // empty-input SQL behaviour.
      expect(rows).toHaveLength(1);
      const value = rows[0]['orders__orderId | COUNTUNIQUE'];
      expect(value).not.toBeNull();
      expect(Number(value)).toBe(0);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended SUM/AVG through a bridge — DEFAULT non-identity pre-join SUM value sleeve
// ( coverage, real BigQuery). Every prior value-sleeve fixture in this file uses a
// blended field with aggregateFunction ANY_VALUE (the IDENTITY passthrough): the "Blended
// SUM/AVG through a bridge" fixture above sources `orders__revenue` from a raw single-row
// `orders(orderId, revenue)` table. The funnel fixture DOES use a non-identity field,
// but it is single-hop (no bridge/dimension fan-out) and pre-join COUNT_DISTINCT, not SUM.
//
// This fixture proves the DEFAULT production shape: a joined NUMERIC field pre-aggregated
// with SUM at its OWN join key (e.g. an order's line-item total) — the field's OWN
// `aggregateFunction: 'SUM'` — feeding a REPORT-level joined SUM/AVG THROUGH a bridge that
// genuinely fans out a shared owner across dimension groups. This exercises the
// buildValueSleeveGroupCte non-identity branch's `_oid` = pre-join GROUP KEY dedup exactly
// the way the identity branch's `_oid` = `__owox_rid` was proven for the ANY_VALUE bridge above —
// same fan-out, same expected numbers, different value-sleeve shape underneath.
//
// Topology: main = items (order-product bridge, one row per pair). TWO sibling chains off
// main: products (dimension: category, ANY_VALUE) and order_lines (metric owner: SUM
// lineAmount, pre-join aggregateFunction SUM — NON-identity).
//
// Seed (order_lines pre-sums to the SAME per-order revenue as the ANY_VALUE bridge fixture,
// so the SAME hand-verified ground truth applies):
//   order_lines(orderId, lineAmount): o1: 60,40 (sum 100) · o2: 30,20 (sum 50) · o3: 30 (sum 30)
//   products(productId, category):    pA/pB = Supplements · pC = Gear
//   items(itemId, orderId, productId):
//     i1 o1 pA · i2 o1 pC   (o1 touches BOTH categories)
//     i3 o2 pA · i4 o2 pB   (o2 touches Supplements via TWO products — the fan-out)
//     i5 o3 pC
//
// Ground truth per category (an order's PRE-SUMMED revenue counts ONCE per category it
// touches, no matter how many of that category's products it bought):
//   Supplements: orders {o1(100), o2(50)} → SUM = 150; AVG = 150 / 2 = 75
//   Gear:        orders {o1(100), o3(30)} → SUM = 130; AVG = 130 / 2 = 65
// (Identical to the ANY_VALUE bridge fixture's ground truth — by construction, since
// order_lines pre-sums to the exact same per-order revenue as that fixture's raw orders
// table. A naive dedup+re-aggregate over the flat join would still double-count o2 under
// Supplements exactly as it did there: 100 + 50 + 50 = 200, AVG = 200/3 = 66.67 — WRONG.)
describeIfCredentials(
  'Blended SUM/AVG through a bridge — DEFAULT non-identity pre-join SUM ( coverage, real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let credentials: ReturnType<typeof BigQueryServiceAccountCredentialsSchema.parse>;
    let config: BigQueryConfig;
    let itemsFQN: string;
    let orderLinesFQN: string;
    let productsFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function bridgeRelationship(
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

    // main -> products (dimension: category) AND main -> orders (metric owner: pre-join SUM
    // of lineAmount, NON-identity) — both chains are roots off main (siblings).
    function bridgeContext(fn: 'SUM' | 'AVG'): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'products__category',
            aliasPath: 'products',
            originalFieldName: 'category',
            type: 'STRING',
          },
          {
            name: 'orders__revenue',
            aliasPath: 'orders',
            originalFieldName: 'lineAmount',
            type: 'NUMERIC',
          },
        ],
        availableSources: [
          { aliasPath: 'products', isIncluded: true },
          { aliasPath: 'orders', isIncluded: true },
        ],
      } as never);

      return {
        mainTableReference: `\`${itemsFQN}\``,
        mainDataMartTitle: 'Items',
        mainDataMartUrl: 'http://x/items',
        chains: [
          {
            relationship: bridgeRelationship('rel-products', 'products', [
              { sourceFieldName: 'productId', targetFieldName: 'productId' },
            ]),
            targetTableReference: `\`${productsFQN}\``,
            parentAlias: 'main',
            cteName: 'products',
            blendedFields: [
              {
                targetFieldName: 'category',
                outputAlias: 'products__category',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Products',
            targetDataMartUrl: 'http://x/products',
          },
          {
            relationship: bridgeRelationship('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: `\`${orderLinesFQN}\``,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'lineAmount',
                outputAlias: 'orders__revenue',
                isHidden: false,
                // The DEFAULT production shape: the field's OWN pre-join roll-up is a real
                // aggregate (per-order line-item total), not a raw passthrough.
                aggregateFunction: 'SUM',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
          },
        ],
        columns: ['products__category', 'orders__revenue'],
        aggregations: [{ column: 'orders__revenue', function: fn }],
        fieldIndex,
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
      itemsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.default_bridge_items_${stamp}`;
      orderLinesFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.default_bridge_order_lines_${stamp}`;
      productsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.default_bridge_products_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${itemsFQN}\` (itemId STRING, orderId STRING, productId STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${itemsFQN}\` (itemId, orderId, productId) VALUES
        ('i1','o1','pA'), ('i2','o1','pC'),
        ('i3','o2','pA'), ('i4','o2','pB'),
        ('i5','o3','pC')`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${orderLinesFQN}\` (orderId STRING, lineAmount NUMERIC)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${orderLinesFQN}\` (orderId, lineAmount) VALUES
        ('o1', 60), ('o1', 40),
        ('o2', 30), ('o2', 20),
        ('o3', 30)`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${productsFQN}\` (productId STRING, category STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${productsFQN}\` (productId, category) VALUES
        ('pA','Supplements'), ('pB','Supplements'), ('pC','Gear')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [itemsFQN, orderLinesFQN, productsFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop DEFAULT-non-identity bridge table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('the sleeve reads the OWNER dedup CTE column and projects NO __owox_rid for this non-identity owner', () => {
      const { sql } = builder.buildBlendedQuery(bridgeContext('SUM'));

      // Non-identity value-sleeve branch: _val reads the owner's OWN already-summed dedup
      // CTE column (`orders.orders__revenue`, `SUM(lineAmount)` per orderId), never the raw
      // per-line-item column — the sleeve CTE's OWN body never references `orders_raw` at all
      // (mirrors the funnel fixture's equivalent assertion).
      const sleeveBody = extractCteBody(sql, 'sleeve_orders__revenue');
      expect(sleeveBody).toContain('orders.orders__revenue');
      expect(sleeveBody).not.toContain('orders_raw');
      // this owner's ONLY value-sleeve metric is non-identity, so its raw CTE
      // must not carry the (unused) row surrogate.
      const ordersRaw = extractCteBody(sql, 'orders_raw');
      expect(ordersRaw).not.toContain('__owox_rid');
    });

    it('joined SUM over a DEFAULT non-identity pre-join SUM is set-based correct through the bridge: Supplements=150 (not naive 200), Gear=130', async () => {
      const rows = await runBlend(bridgeContext('SUM'));

      expect(rows).toHaveLength(2);
      const byCategory = new Map(
        rows.map(r => [String(r.products__category), Number(r['orders__revenue | SUM'])])
      );

      // o2 fans out across TWO Supplements products (pA, pB) — the sleeve must count o2's
      // pre-summed $50 ONCE, not twice.
      expect(byCategory.get('Supplements')).toBe(150);
      // Control: Gear has no repeated order per category, so naive and correct coincide.
      expect(byCategory.get('Gear')).toBe(130);
    }, 120000);

    it('joined AVG over a DEFAULT non-identity pre-join SUM is set-based correct through the bridge: Supplements=75 (not naive 66.67), Gear=65', async () => {
      const rows = await runBlend(bridgeContext('AVG'));

      expect(rows).toHaveLength(2);
      const byCategory = new Map(
        rows.map(r => [String(r.products__category), Number(r['orders__revenue | AVG'])])
      );

      expect(byCategory.get('Supplements')).toBe(75);
      expect(byCategory.get('Gear')).toBe(65);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Totals under a metric filter (real BigQuery). A Totals query has no GROUP BY,
// so the report's HAVING cannot apply there — it used to be dropped, and Totals
// then summarised rows the report hides.
//
// Seed:
//   orders(orderId, amount): o1=100, o2=50, o3=30
//   events(eventId, country, orderId, weight):
//     ev1 US o1 w40 · ev2 US o2 w40 · ev3 CA o1 w40 · ev4 DE o3 w10
//
// Report: GROUP BY country, HAVING SUM(weight) > 20
//   US 80 · CA 40 · DE 10  → DE is hidden.
//
// The metric filter deliberately targets a MAIN-native metric. A HAVING on a JOINED metric is
// rejected by the output-controls validator at save time (it would be evaluated against the dedup
// CTE, not the sleeve that computes it), so filtering on `SUM(orders__amount)` here would have
// proved a configuration the product refuses to store — and the builder now refuses it too.
//
// Ground truth for Totals over the SURVIVING rows (US + CA):
//   SUM              = 150   — o1 is ONE order row even though two groups reach it
//   COUNT_DISTINCT   = 2     — o1 counted once, again across both groups
// Before the fix the unrestricted Totals returned 180 and 3: DE's order included,
// and nothing about that discrepancy was visible to the user.
// ---------------------------------------------------------------------------
describeIfCredentials('Totals restricted to the groups a metric filter keeps', () => {
  let adapter: BigQueryApiAdapter;
  let eventsFQN: string;
  let ordersFQN: string;

  const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

  function context(withRestriction: boolean, bucket?: 'MONTH'): BlendedQueryContext {
    const fieldIndex = buildBlendedFieldIndex({
      blendedFields: [
        {
          name: 'orders__amount',
          aliasPath: 'orders',
          originalFieldName: 'amount',
          type: 'NUMERIC',
        },
        {
          name: 'orders__orderId',
          aliasPath: 'orders',
          originalFieldName: 'orderId',
          type: 'STRING',
        },
      ],
      availableSources: [{ aliasPath: 'orders', isIncluded: true }],
    } as never);

    return {
      mainTableReference: `\`${eventsFQN}\``,
      mainDataMartTitle: 'Events',
      mainDataMartUrl: 'http://x/events',
      chains: [
        {
          relationship: {
            id: 'rel-orders',
            targetAlias: 'orders',
            joinConditions: [{ sourceFieldName: 'orderId', targetFieldName: 'orderId' }],
            blendedFields: [],
            projectId: 'proj',
            createdById: 'user-1',
            createdAt: new Date(),
            modifiedAt: new Date(),
          } as unknown as DataMartRelationship,
          targetTableReference: `\`${ordersFQN}\``,
          parentAlias: 'main',
          cteName: 'orders',
          blendedFields: [
            {
              targetFieldName: 'amount',
              outputAlias: 'orders__amount',
              isHidden: false,
              aggregateFunction: 'ANY_VALUE',
            },
            {
              targetFieldName: 'orderId',
              outputAlias: 'orders__orderId',
              isHidden: false,
              aggregateFunction: 'ANY_VALUE',
            },
          ],
          targetDataMartTitle: 'Orders',
          targetDataMartUrl: 'http://x/orders',
        },
      ],
      // Totals are metrics-only: no dimension is projected, hence no GROUP BY.
      columns: ['orders__amount', 'orders__orderId'],
      aggregations: [
        { column: 'orders__amount', function: 'SUM' },
        { column: 'orders__orderId', function: 'COUNT_DISTINCT' },
      ],
      columnTypes: { postJoin: new Map([['country', 'STRING']]) },
      fieldIndex,
      groupRestriction: withRestriction
        ? bucket
          ? {
              // Same report, grouped by MONTH: no single day clears 60, only the month does.
              dimensions: ['eventDate'],
              dateTruncs: [{ column: 'eventDate', unit: bucket }],
              having: [
                {
                  column: 'weight',
                  function: 'SUM',
                  operator: 'gt',
                  value: 60,
                  placement: 'post-join',
                },
              ] as never,
            }
          : {
              dimensions: ['country'],
              having: [
                {
                  column: 'weight',
                  function: 'SUM',
                  operator: 'gt',
                  value: 20,
                  placement: 'post-join',
                },
              ] as never,
            }
        : undefined,
    };
  }

  async function runBlend(ctx: BlendedQueryContext): Promise<Record<string, unknown>[]> {
    const { sql, params } = builder.buildBlendedQuery(ctx);
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
    const credentials = BigQueryServiceAccountCredentialsSchema.parse(
      JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
    );
    adapter = new BigQueryApiAdapter(credentials, {
      projectId: BQ_PROJECT_ID!,
      location: BIGQUERY_AUTODETECT_LOCATION,
    });

    const stamp = `${Date.now()}`;
    eventsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.kept_events_${stamp}`;
    ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.kept_orders_${stamp}`;

    await adapter.executeQuery(
      `CREATE TABLE \`${eventsFQN}\` (eventId STRING, country STRING, orderId STRING, weight INT64, eventDate DATE)`
    );
    await adapter.executeQuery(
      `INSERT INTO \`${eventsFQN}\` (eventId, country, orderId, weight, eventDate) VALUES
      ('ev1','US','o1',40,'2026-01-05'), ('ev2','US','o2',40,'2026-01-20'),
      ('ev3','CA','o1',40,'2026-02-10'), ('ev4','DE','o3',10,'2026-03-15')`
    );
    await adapter.executeQuery(`CREATE TABLE \`${ordersFQN}\` (orderId STRING, amount NUMERIC)`);
    await adapter.executeQuery(
      `INSERT INTO \`${ordersFQN}\` (orderId, amount) VALUES ('o1', 100), ('o2', 50), ('o3', 30)`
    );
  }, 180000);

  afterAll(async () => {
    for (const fqn of [eventsFQN, ordersFQN]) {
      try {
        await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
      } catch (error) {
        console.warn(`Failed to drop kept-groups fixture table ${fqn}:`, error);
      }
    }
  }, 60000);

  it('fan-out: Totals over the surviving groups: SUM=150 and COUNT DISTINCT=2, not the unrestricted 180/3', async () => {
    const rows = await runBlend(context(true));

    expect(rows).toHaveLength(1);
    // DE's order is excluded because its group did not pass the metric filter...
    expect(Number(rows[0]['orders__amount | SUM'])).toBe(150);
    // ...and o1 counts once even though BOTH surviving groups (US, CA) reach it.
    expect(Number(rows[0]['orders__orderId | COUNTUNIQUE'])).toBe(2);
  }, 120000);

  // The restriction must be recomputed at the REPORT's grain. A Totals query carries no
  // dateTruncs of its own, so a bucket that does not travel with the restriction regroups it by
  // RAW date: the monthly seed below has no single day above 60, so the kept set comes back
  // EMPTY and Totals read NULL/0 while the report shows January.
  it('fan-out: restriction honours the report date bucket: month passes where no day does (150/2)', async () => {
    const rows = await runBlend(context(true, 'MONTH'));

    expect(rows).toHaveLength(1);
    // January (40 + 40 = 80) is the only month above 60; its two rows reach o1 and o2.
    expect(Number(rows[0]['orders__amount | SUM'])).toBe(150);
    expect(Number(rows[0]['orders__orderId | COUNTUNIQUE'])).toBe(2);
  }, 120000);

  it('fan-out: sanity: without the metric filter the same Totals include every group (180/3)', async () => {
    const rows = await runBlend(context(false));

    expect(rows).toHaveLength(1);
    expect(Number(rows[0]['orders__amount | SUM'])).toBe(180);
    expect(Number(rows[0]['orders__orderId | COUNTUNIQUE'])).toBe(3);
  }, 120000);
});

// De-duplication by the joined Data Mart's DECLARED PRIMARY KEY.
//
// Seed — carts(cartId, orderId, region): c1→o1/EU, c2→o2/EU, c3→o3/US, c4→o4/APAC,
// c5→o5/APAC, c6→o6/APAC. orders(orderId, revenue): o1=100 twice (a true duplicate row),
// o2=70, o3=40 and o3=41 (same key, contradictory values), o4=10, o5=20, o6=30 five times.
//
// Ground truth with the key declared: EU 170, US 81, APAC median 20.
// Without it the surrogate makes each raw row its own owner: EU 270, APAC median 30.
describeIfCredentials(
  'value sleeve de-duplicates by a declared primary key (real BigQuery)',
  () => {
    let adapter: BigQueryApiAdapter;
    let cartsFQN: string;
    let ordersFQN: string;

    const builder = new BigQueryBlendedQueryBuilder(new BigQueryClauseRenderer());

    function context(
      primaryKeyFields: string[],
      fn: 'SUM' | 'P50' | 'STRING_AGG' | 'MIN' | 'MAX' = 'SUM'
    ): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          {
            name: 'orders__revenue',
            aliasPath: 'orders',
            originalFieldName: 'revenue',
            type: 'NUMERIC',
          },
          {
            name: 'orders__status',
            aliasPath: 'orders',
            originalFieldName: 'status',
            type: 'STRING',
          },
        ],
        availableSources: [{ aliasPath: 'orders', isIncluded: true }],
      } as never);

      const valueColumn = fn === 'STRING_AGG' ? 'orders__status' : 'orders__revenue';

      return {
        mainTableReference: `\`${cartsFQN}\``,
        mainDataMartTitle: 'Carts',
        mainDataMartUrl: 'http://x/carts',
        chains: [
          {
            relationship: {
              id: 'rel-orders',
              targetAlias: 'orders',
              joinConditions: [{ sourceFieldName: 'orderId', targetFieldName: 'orderId' }],
              blendedFields: [],
              projectId: 'proj',
              createdById: 'user-1',
              createdAt: new Date(),
              modifiedAt: new Date(),
            } as unknown as DataMartRelationship,
            targetTableReference: `\`${ordersFQN}\``,
            parentAlias: 'main',
            cteName: 'orders',
            blendedFields: [
              {
                targetFieldName: 'revenue',
                outputAlias: 'orders__revenue',
                // Raw passthrough — the identity branch, the only one a declared key applies to.
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
              {
                targetFieldName: 'status',
                outputAlias: 'orders__status',
                isHidden: false,
                aggregateFunction: 'ANY_VALUE',
              },
            ],
            targetDataMartTitle: 'Orders',
            targetDataMartUrl: 'http://x/orders',
            targetPrimaryKeyFields: primaryKeyFields,
          },
        ],
        columns: ['region', valueColumn],
        aggregations: [{ column: valueColumn, function: fn }],
        fieldIndex,
      };
    }

    async function runBlend(ctx: BlendedQueryContext): Promise<Record<string, unknown>[]> {
      const { sql, params } = builder.buildBlendedQuery(ctx);
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

    const byRegionOf = (rows: Record<string, unknown>[], label: string) =>
      new Map(rows.map(r => [String(r.region), Number(r[label])]));
    const sumByRegion = (rows: Record<string, unknown>[]) =>
      byRegionOf(rows, 'orders__revenue | SUM');

    beforeAll(async () => {
      const credentials = BigQueryServiceAccountCredentialsSchema.parse(
        JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
      );
      adapter = new BigQueryApiAdapter(credentials, {
        projectId: BQ_PROJECT_ID!,
        location: BIGQUERY_AUTODETECT_LOCATION,
      });

      const stamp = `${Date.now()}`;
      cartsFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.pkdedup_carts_${stamp}`;
      ordersFQN = `${BQ_PROJECT_ID}.${BQ_DATASET}.pkdedup_orders_${stamp}`;

      await adapter.executeQuery(
        `CREATE TABLE \`${cartsFQN}\` (cartId STRING, orderId STRING, region STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${cartsFQN}\` (cartId, orderId, region) VALUES
        ('c1','o1','EU'), ('c2','o2','EU'), ('c3','o3','US'),
        ('c4','o4','APAC'), ('c5','o5','APAC'), ('c6','o6','APAC')`
      );

      await adapter.executeQuery(
        `CREATE TABLE \`${ordersFQN}\` (orderId STRING, revenue NUMERIC, status STRING)`
      );
      await adapter.executeQuery(
        `INSERT INTO \`${ordersFQN}\` (orderId, revenue, status) VALUES
        ('o1', 100, 'paid'), ('o1', 100, 'paid'), ('o2', 70, 'shipped'),
        ('o3', 40, 'paid'), ('o3', 41, 'paid'),
        ('o4', 10, 'paid'), ('o5', 20, 'paid'),
        ('o6', 30, 'paid'), ('o6', 30, 'paid'), ('o6', 30, 'paid'), ('o6', 30, 'paid'),
        ('o6', 30, 'paid')`
      );
    }, 180000);

    afterAll(async () => {
      for (const fqn of [cartsFQN, ordersFQN]) {
        try {
          await adapter.executeQuery(`DROP TABLE IF EXISTS \`${fqn}\``);
        } catch (error) {
          console.warn(`Failed to drop pk-dedup table ${fqn}:`, error);
        }
      }
    }, 60000);

    it('counts a duplicated joined row ONCE: EU=170, and keeps contradictory rows apart: US=81', async () => {
      const { sql } = builder.buildBlendedQuery(context(['orderId']));
      expect(sql).not.toContain('__owox_rid');
      expect(sql).not.toContain('ROW_NUMBER()');

      const byRegion = sumByRegion(await runBlend(context(['orderId'])));

      expect(byRegion.get('EU')).toBe(170);
      // The sleeve removes the join's duplicates, not the data's.
      expect(byRegion.get('US')).toBe(81);
    }, 120000);

    it('without a declared key the same data reads EU=270 — the duplicate is summed twice', async () => {
      const { sql } = builder.buildBlendedQuery(context([]));
      expect(sql).toContain('AS __owox_rid');

      const byRegion = sumByRegion(await runBlend(context([])));

      expect(byRegion.get('EU')).toBe(270);
      expect(byRegion.get('US')).toBe(81);
    }, 120000);

    // APAC de-duplicated is [10,20,30] and fanned is [10,20,30,30,30,30,30] — both odd-sized, so
    // the median is unambiguous whatever BigQuery's approximate-quantile rounding does.
    it('a percentile is taken over the de-duplicated distribution: APAC median 20, not 30', async () => {
      const rows = await runBlend(context(['orderId'], 'P50'));
      expect(byRegionOf(rows, 'orders__revenue | MEDIAN').get('APAC')).toBe(20);

      const fanned = await runBlend(context([], 'P50'));
      expect(byRegionOf(fanned, 'orders__revenue | MEDIAN').get('APAC')).toBe(30);
    }, 120000);

    // Post-join STRING_AGG read the dedup CTE once per fanned main row, repeating the joined
    // value verbatim. EU has two carts on two orders, so the list is one entry per order.
    // US holds one order with two raw rows, 40 and 41. Reading MIN/MAX off the dedup CTE saw only
    // the value the pre-join roll-up kept, so MIN came back 41 — above the 40.5 average of the
    // very same column.
    it('MIN and MAX read the same rows as AVG: US MIN 40, MAX 41', async () => {
      const min = await runBlend(context(['orderId'], 'MIN'));
      const max = await runBlend(context(['orderId'], 'MAX'));

      expect(byRegionOf(min, 'orders__revenue | MIN').get('US')).toBe(40);
      expect(byRegionOf(max, 'orders__revenue | MAX').get('US')).toBe(41);
    }, 120000);

    it('STRING_AGG lists each joined row once, not once per fanned main row', async () => {
      const rows = await runBlend(context(['orderId'], 'STRING_AGG'));
      const eu = rows.find(r => r.region === 'EU')!;
      expect(String(eu['orders__status | STRINGAGG']).split(', ').sort()).toEqual([
        'paid',
        'shipped',
      ]);
    }, 120000);
  }
);
