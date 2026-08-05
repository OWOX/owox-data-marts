import { AthenaApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/athena-api.adapter';
import { AthenaCredentials } from 'src/data-marts/data-storage-types/athena/schemas/athena-credentials.schema';
import { AthenaConfig } from 'src/data-marts/data-storage-types/athena/schemas/athena-config.schema';
import { S3ApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/s3-api.adapter';
import { AthenaApiAdapterFactory } from 'src/data-marts/data-storage-types/athena/adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from 'src/data-marts/data-storage-types/athena/adapters/s3-api-adapter.factory';
import { AthenaDataMartSchemaProvider } from 'src/data-marts/data-storage-types/athena/services/athena-data-mart-schema.provider';
import { AthenaClauseRenderer } from 'src/data-marts/data-storage-types/athena/services/athena-clause-renderer';
import { AthenaQueryBuilder } from 'src/data-marts/data-storage-types/athena/services/athena-query.builder';
import { DataStorageCredentialsResolver } from 'src/data-marts/data-storage-types/data-storage-credentials-resolver.service';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';
import { AthenaBlendedQueryBuilder } from 'src/data-marts/data-storage-types/athena/services/athena-blended-query-builder';
import { BlendedQueryContext } from 'src/data-marts/data-storage-types/interfaces/blended-query-builder.interface';
import { DataMartRelationship } from 'src/data-marts/entities/data-mart-relationship.entity';
import { buildBlendedFieldIndex } from 'src/data-marts/services/blended-field-index';

/**
 * Athena Integration Tests
 *
 * These tests validate that Athena adapter code works with real AWS credentials.
 * They catch AWS SDK issues, permission problems, and Trino/Presto SQL dialect bugs
 * that in-memory tests cannot detect.
 *
 * Required environment variables:
 *   AWS_ACCESS_KEY_ID      - AWS access key ID
 *   AWS_SECRET_ACCESS_KEY  - AWS secret access key
 *   ATHENA_REGION          - AWS region where Athena is configured (e.g., us-east-1)
 *   ATHENA_OUTPUT_BUCKET   - S3 bucket name for Athena query results (without s3:// prefix)
 *   ATHENA_DATABASE        - Athena database name (must already exist)
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
  console.log('Skipping Athena integration tests: AWS credentials or Athena config not set');
}

const describeIfCredentials = ATHENA_CREDENTIALS_AVAILABLE ? describe : describe.skip;

describeIfCredentials('Athena Integration Tests', () => {
  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let credentials: AthenaCredentials;
  let config: AthenaConfig;
  let database: string;

  const TEST_TABLE_SUFFIX = `integration_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

    // Drop any leftover table from a crashed previous run (Pitfall 4)
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

    // Create test table via CTAS with multiple rows so output-controls tests
    // can assert that filters include/exclude correctly.
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
  }, 120000);

  afterAll(async () => {
    try {
      // Drop test table
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
      // Clean up all S3 output files under this run's unique prefix
      // (covers data, ctas, cleanup, drop, dry-run, schema query outputs)
      await s3Adapter.cleanupOutputFiles(config.outputBucket, TEST_S3_PREFIX);
    } catch (error) {
      console.warn('Failed to clean up S3 output files:', error);
    }
  }, 90000);

  describe('Access Validation', () => {
    it('should accept valid credentials', async () => {
      await expect(adapter.checkAccess(config.outputBucket)).resolves.not.toThrow();
    }, 30000);

    it('should reject invalid credentials', async () => {
      const invalidAdapter = new AthenaApiAdapter(
        { accessKeyId: 'INVALID_KEY_ID', secretAccessKey: 'invalid_secret' },
        config
      );

      await expect(invalidAdapter.checkAccess(config.outputBucket)).rejects.toThrow();
    }, 30000);
  });

  describe('SQL Dry Run', () => {
    it('should validate correct query via EXPLAIN', async () => {
      await expect(
        adapter.executeDryRunQuery(
          `SELECT * FROM "${database}"."${TEST_TABLE_SUFFIX}"`,
          config.outputBucket
        )
      ).resolves.not.toThrow();
    }, 30000);

    it('should reject invalid SQL syntax', async () => {
      await expect(
        adapter.executeDryRunQuery('SELEKT * FORM invalid', config.outputBucket)
      ).rejects.toThrow();
    }, 30000);

    it('should reject query on non-existent table', async () => {
      await expect(
        adapter.executeDryRunQuery(
          `SELECT * FROM "${database}"."nonexistent_table_xxx"`,
          config.outputBucket
        )
      ).rejects.toThrow();
    }, 30000);
  });

  describe('Schema Actualization', () => {
    it('should read real table schema with correct field names and types', async () => {
      const queryBuilder = new AthenaQueryBuilder(new AthenaClauseRenderer());
      const adapterFactory = new AthenaApiAdapterFactory({} as DataStorageCredentialsResolver);
      const s3AdapterFactory = new S3ApiAdapterFactory({} as DataStorageCredentialsResolver);
      const schemaProvider = new AthenaDataMartSchemaProvider(
        adapterFactory,
        s3AdapterFactory,
        queryBuilder
      );

      const definition: TableDefinition = {
        fullyQualifiedName: `${database}.${TEST_TABLE_SUFFIX}`,
      };

      const result = await schemaProvider.getActualDataMartSchema(definition, config, credentials);

      expect(result.type).toBe('athena-data-mart-schema');
      expect(result.fields).toHaveLength(4);

      const fieldNames = result.fields.map((f: { name: string }) => f.name);
      expect(fieldNames).toEqual(['id', 'name', 'active', 'created_at']);

      for (const field of result.fields) {
        expect(typeof (field as { type: string }).type).toBe('string');
        expect((field as { type: string }).type.length).toBeGreaterThan(0);
      }
    }, 60000);
  });

  describe('Output controls (real filtering)', () => {
    const builder = new AthenaQueryBuilder(new AthenaClauseRenderer());
    const definition: TableDefinition = {
      // fullyQualifiedName is evaluated lazily inside each test after beforeAll sets database
      get fullyQualifiedName() {
        return `${database}.${TEST_TABLE_SUFFIX}`;
      },
    };

    // Builds SQL+params via the query builder, runs it on real Athena, and
    // returns row objects keyed by column name (mirrors AthenaReportReader's
    // parsing: first row is the header, so it is sliced off).
    async function runWithOutputControls(
      queryOptions: Parameters<AthenaQueryBuilder['buildQuery']>[1]
    ): Promise<Record<string, string | undefined>[]> {
      const built = builder.buildQuery(definition, queryOptions);
      if (typeof built === 'string')
        throw new Error('expected QueryBuildResult with output controls');
      const { queryExecutionId } = await adapter.executeQuery(
        built.sql,
        config.outputBucket,
        `${TEST_S3_PREFIX}output-controls/`,
        built.params
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
      const rows = results.ResultSet?.Rows ?? [];
      const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      // First row is the header in Athena results.
      return rows.slice(1).map(r => {
        const obj: Record<string, string | undefined> = {};
        columnInfo.forEach((col, i) => {
          obj[col.Name!] = r.Data?.[i]?.VarCharValue;
        });
        return obj;
      });
    }

    it('eq on a string column filters via ExecutionParameters (validates literal quoting)', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'name', operator: 'eq', value: 'alpha' }],
      });
      expect(rows.map(r => r.id).sort()).toEqual(['1']);
      expect(rows.every(r => r.name === 'alpha')).toBe(true);
    }, 60000);

    it('contains uses strpos and matches substrings', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'name', operator: 'contains', value: 'alpha' }],
      });
      // 'alpha' (id=1) and 'alphabet' (id=4) both contain 'alpha'
      expect(rows.map(r => r.id).sort()).toEqual(['1', '4']);
    }, 60000);

    it('between on a numeric column', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'id', operator: 'between', value: { from: 2, to: 3 } }],
      });
      expect(rows.map(r => r.id).sort()).toEqual(['2', '3']);
    }, 60000);

    // Date/time value comparisons. The UI sends dates as strings and Athena binds
    // params as VARCHAR; Trino refuses to compare a TIMESTAMP column to varchar, so
    // columnTypes drives the renderer to emit CAST(? AS TIMESTAMP). Without it these
    // would fail at execution.
    it('date eq on a TIMESTAMP column (CAST(? AS TIMESTAMP)) → id 2', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'created_at', operator: 'eq', value: '2024-02-01' }],
        columnTypes: new Map([['created_at', 'TIMESTAMP']]),
      });
      expect(rows.map(r => r.id).sort()).toEqual(['2']);
    }, 60000);

    it('date gte on a TIMESTAMP column → ids 3,4', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'created_at', operator: 'gte', value: '2024-03-01' }],
        sort: [{ column: 'id', direction: 'asc' }],
        columnTypes: new Map([['created_at', 'TIMESTAMP']]),
      });
      expect(rows.map(r => r.id)).toEqual(['3', '4']);
    }, 60000);

    it('date between on a TIMESTAMP column → ids 2,3', async () => {
      const rows = await runWithOutputControls({
        filters: [
          {
            column: 'created_at',
            operator: 'between',
            value: { from: '2024-02-01', to: '2024-03-01' },
          },
        ],
        sort: [{ column: 'id', direction: 'asc' }],
        columnTypes: new Map([['created_at', 'TIMESTAMP']]),
      });
      expect(rows.map(r => r.id)).toEqual(['2', '3']);
    }, 60000);

    it('is_true on a boolean column', async () => {
      const rows = await runWithOutputControls({
        filters: [{ column: 'active', operator: 'is_true' }],
      });
      expect(rows.map(r => r.id).sort()).toEqual(['1', '3', '4']);
    }, 60000);

    it('sort + limit', async () => {
      const rows = await runWithOutputControls({
        sort: [{ column: 'id', direction: 'desc' }],
        limit: 2,
      });
      expect(rows.map(r => r.id)).toEqual(['4', '3']);
    }, 60000);

    it('special characters in a string value do not break binding (single-quote escaping)', async () => {
      // No row matches; the point is the query executes without error and returns
      // 0 rows, proving "O'Brien" is bound safely as a literal, not injected.
      const rows = await runWithOutputControls({
        filters: [{ column: 'name', operator: 'eq', value: "O'Brien" }],
      });
      expect(rows).toHaveLength(0);
    }, 60000);
  });

  // ---------------------------------------------------------------------------
  // Aggregation (real GROUP BY / percentile / date-trunc / totals)
  // ---------------------------------------------------------------------------
  // Seed (4 rows): id(int), name(varchar), active(boolean), created_at(timestamp)
  //   (1, 'alpha',    true,  2024-01-01)
  //   (2, 'beta',     false, 2024-02-01)
  //   (3, 'gamma',    true,  2024-03-01)
  //   (4, 'alphabet', true,  2024-04-01)
  //
  // No `amount` column → aggregations run on `id` (numeric). String agg on `name`.
  // Group-by dimension: `active`. Date-trunc on `created_at`.
  //
  // Trino dialect specifics:
  //   - Percentile: APPROX_PERCENTILE(col, fraction) — APPROXIMATE → assert range + monotonic.
  //   - STRING_AGG: array_join(array_agg(col), ', ') — unordered → split + sort before comparing.
  //   - date_trunc: date_trunc('month'/'year', col) → returns TIMESTAMP as VarCharValue string.
  describe('Aggregation (real GROUP BY / percentile / date-trunc / totals)', () => {
    // Totals under a metric filter, on the FLAT (non-blended) path. A Totals query has no GROUP BY,
    // so the report's HAVING travels as a `groupRestriction` and the builder joins the groups that
    // survive it. Two things are proven here that no unit test can: that this engine ACCEPTS the
    // emitted SQL — the restriction subquery selects the same columns off the same table as the outer
    // query, which made every outer reference ambiguous until the keys were given private aliases —
    // and that the number is restricted rather than merely filtered.
    it('fan-out: Totals are restricted to the groups the metric filter keeps (real Athena)', async () => {
      // GROUP BY active, HAVING SUM(id) > 5: active=true (1+3+4=8) survives, false (2) does not.
      const restricted = await runWithAggregations({
        columns: ['id'],
        aggregations: [{ column: 'id', function: 'SUM' }],
        groupRestriction: {
          dimensions: ['active'],
          having: [{ column: 'id', function: 'SUM', operator: 'gt', value: 5 }],
        },
      } as never);
      const unrestricted = await runWithAggregations({
        columns: ['id'],
        aggregations: [{ column: 'id', function: 'SUM' }],
      });

      expect(Number(restricted[0]['id | SUM'])).toBe(8);
      expect(Number(unrestricted[0]['id | SUM'])).toBe(10);
    }, 120000);

    const aggBuilder = new AthenaQueryBuilder(new AthenaClauseRenderer());
    const aggDefinition: TableDefinition = {
      get fullyQualifiedName() {
        return `${database}.${TEST_TABLE_SUFFIX}`;
      },
    };

    // Builds SQL+params via AthenaQueryBuilder and runs on real Athena.
    // Returns row objects keyed by column name (header row is sliced off,
    // mirroring AthenaReportReader parsing).
    async function runWithAggregations(
      queryOptions: Parameters<AthenaQueryBuilder['buildQuery']>[1]
    ): Promise<Record<string, string | undefined>[]> {
      const built = aggBuilder.buildQuery(aggDefinition, queryOptions);
      if (typeof built === 'string') throw new Error('expected QueryBuildResult with aggregations');
      const { queryExecutionId } = await adapter.executeQuery(
        built.sql,
        config.outputBucket,
        `${TEST_S3_PREFIX}aggregations/`,
        built.params
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
      const rows = results.ResultSet?.Rows ?? [];
      const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      // First row is the header in Athena results.
      return rows.slice(1).map(r => {
        const obj: Record<string, string | undefined> = {};
        columnInfo.forEach((col, i) => {
          obj[col.Name!] = r.Data?.[i]?.VarCharValue;
        });
        return obj;
      });
    }

    // Case 1 — group-by + multi-fn (SUM+AVG) + COUNT_DISTINCT on `id`.
    // active=true → ids 1,3,4: SUM=8, AVG≈2.667, COUNT_DISTINCT=3, Row Count=3
    // active=false → id 2:     SUM=2, AVG=2.0,   COUNT_DISTINCT=1, Row Count=1
    it('group-by active + SUM/AVG/COUNT_DISTINCT on id + Row Count → real per-group values', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'id'],
        rowCount: true,
        aggregations: [
          { column: 'id', function: 'SUM' },
          { column: 'id', function: 'AVG' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(2);
      // Athena returns booleans as 'true'/'false' strings in VarCharValue.
      const byActive = new Map(rows.map(r => [r.active, r]));

      const active = byActive.get('true')!;
      expect(active).toBeDefined();
      expect(Number(active['id | SUM'])).toBe(8); // 1+3+4
      expect(Number(active['id | AVG'])).toBeCloseTo(8 / 3, 3);
      expect(Number(active['id | COUNTUNIQUE'])).toBe(3);
      expect(Number(active['Row Count'])).toBe(3);

      const inactive = byActive.get('false')!;
      expect(inactive).toBeDefined();
      expect(Number(inactive['id | SUM'])).toBe(2);
      expect(Number(inactive['id | AVG'])).toBeCloseTo(2.0, 5);
      expect(Number(inactive['id | COUNTUNIQUE'])).toBe(1);
      expect(Number(inactive['Row Count'])).toBe(1);
    }, 60000);

    // Case 2 — MIN / MAX / plain COUNT (group by active).
    // active=true → ids 1,3,4: MIN=1, MAX=4, COUNT=3
    // active=false → id 2:     MIN=2, MAX=2, COUNT=1
    it('MIN / MAX / COUNT grouped by active → real extrema and counts', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'id'],
        aggregations: [
          { column: 'id', function: 'MIN' },
          { column: 'id', function: 'MAX' },
          { column: 'id', function: 'COUNT' },
        ],
      });

      expect(rows).toHaveLength(2);
      const byActive = new Map(rows.map(r => [r.active, r]));

      const active = byActive.get('true')!;
      expect(active).toBeDefined();
      expect(Number(active['id | MIN'])).toBe(1);
      expect(Number(active['id | MAX'])).toBe(4);
      expect(Number(active['id | COUNT'])).toBe(3);

      const inactive = byActive.get('false')!;
      expect(inactive).toBeDefined();
      expect(Number(inactive['id | MIN'])).toBe(2);
      expect(Number(inactive['id | MAX'])).toBe(2);
      expect(Number(inactive['id | COUNT'])).toBe(1);
    }, 60000);

    // Case 3 — STRING_AGG via array_join(array_agg(col), ', ').
    // Trino array_agg has no guaranteed order → split + sort before comparing.
    // active=true  → names: alpha, gamma, alphabet
    // active=false → names: beta
    it('STRING_AGG on name grouped by active → sorted members match seed (order-insensitive)', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'name'],
        aggregations: [{ column: 'name', function: 'STRING_AGG' }],
      });

      expect(rows).toHaveLength(2);
      const byActive = new Map(rows.map(r => [r.active, r]));

      const splitSorted = (v: string | undefined): string[] =>
        (v ?? '')
          .split(', ')
          .map(s => s.trim())
          .sort();

      const active = byActive.get('true')!;
      expect(active).toBeDefined();
      expect(splitSorted(active['name | STRINGAGG'])).toEqual(['alpha', 'alphabet', 'gamma']);

      const inactive = byActive.get('false')!;
      expect(inactive).toBeDefined();
      expect(splitSorted(inactive['name | STRINGAGG'])).toEqual(['beta']);
    }, 60000);

    // Case 4 — percentiles P25/P50/P75/P95 over all 4 rows (no group-by).
    // APPROX_PERCENTILE is approximate; assert values are finite, within [1, 4],
    // and monotonically non-decreasing.
    it('all percentiles (P25/P50/P75/P95) on id are finite, within [1,4], and monotonic', async () => {
      const rows = await runWithAggregations({
        columns: ['id'],
        aggregations: [
          { column: 'id', function: 'P25' },
          { column: 'id', function: 'P50' },
          { column: 'id', function: 'P75' },
          { column: 'id', function: 'P95' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      const p25 = Number(row['id | P25']);
      const p50 = Number(row['id | MEDIAN']);
      const p75 = Number(row['id | P75']);
      const p95 = Number(row['id | P95']);

      for (const p of [p25, p50, p75, p95]) {
        expect(Number.isFinite(p)).toBe(true);
        expect(p).toBeGreaterThanOrEqual(1);
        expect(p).toBeLessThanOrEqual(4);
      }
      expect(p25).toBeLessThanOrEqual(p50);
      expect(p50).toBeLessThanOrEqual(p75);
      expect(p75).toBeLessThanOrEqual(p95);
    }, 60000);

    // Case 5 — date-trunc MONTH + SUM.
    // Each row is in a distinct month → 4 buckets, each with SUM(id) = the row's id.
    // Trino date_trunc returns a TIMESTAMP; VarCharValue starts with 'YYYY-MM-DD'.
    it('date-trunc MONTH + SUM on id → 4 month buckets with the seeded sums', async () => {
      const rows = await runWithAggregations({
        columns: ['created_at', 'id'],
        rowCount: true,
        dateTruncs: [{ column: 'created_at', unit: 'MONTH' }],
        aggregations: [{ column: 'id', function: 'SUM' }],
      });

      expect(rows).toHaveLength(4);

      // Trino date_trunc returns a timestamp string; take the first 10 chars for the date.
      const monthStart = (r: Record<string, string | undefined>): string =>
        (r.created_at ?? '').slice(0, 10);

      const sumByMonth = new Map(rows.map(r => [monthStart(r), Number(r['id | SUM'])]));

      expect(sumByMonth.get('2024-01-01')).toBe(1);
      expect(sumByMonth.get('2024-02-01')).toBe(2);
      expect(sumByMonth.get('2024-03-01')).toBe(3);
      expect(sumByMonth.get('2024-04-01')).toBe(4);

      // Row Count is 1 per month (one seeded row each).
      for (const r of rows) {
        expect(Number(r['Row Count'])).toBe(1);
      }
    }, 60000);

    // Case 6 — date-trunc YEAR + SUM (all 4 rows in 2024 → 1 bucket, SUM=10).
    it('date-trunc YEAR + SUM on id → single 2024 bucket with SUM 10', async () => {
      const rows = await runWithAggregations({
        columns: ['created_at', 'id'],
        dateTruncs: [{ column: 'created_at', unit: 'YEAR' }],
        aggregations: [{ column: 'id', function: 'SUM' }],
      });

      expect(rows).toHaveLength(1);
      expect((rows[0].created_at ?? '').slice(0, 4)).toBe('2024');
      expect(Number(rows[0]['id | SUM'])).toBe(10);
    }, 60000);

    // Case 7 — totals shape (metrics-only, no GROUP BY) → one row.
    it('totals (no GROUP BY) → one row with SUM=10, COUNT_DISTINCT=4, Row Count=4', async () => {
      const rows = await runWithAggregations({
        columns: ['id'],
        rowCount: true,
        aggregations: [
          { column: 'id', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row['id | SUM'])).toBe(10);
      expect(Number(row['id | COUNTUNIQUE'])).toBe(4);
      expect(Number(row['Row Count'])).toBe(4);
    }, 60000);

    // Case 8 — totals WITH a WHERE filter (active=true → ids 1,3,4, SUM=8, count=3).
    it('totals with active=is_true filter → SUM=8, COUNT_DISTINCT=3, Row Count=3', async () => {
      const rows = await runWithAggregations({
        columns: ['id'],
        rowCount: true,
        filters: [{ column: 'active', operator: 'is_true' }],
        aggregations: [
          { column: 'id', function: 'SUM' },
          { column: 'id', function: 'COUNT_DISTINCT' },
        ],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(Number(row['id | SUM'])).toBe(8); // 1+3+4
      expect(Number(row['id | COUNTUNIQUE'])).toBe(3);
      expect(Number(row['Row Count'])).toBe(3);
    }, 60000);

    // Case 9 — aggregation respects a WHERE filter (group-by still narrows correctly).
    // With active=is_false → only id=2; group-by on active gives one group.
    it('aggregation with active=is_false filter → one group, SUM=2, Row Count=1', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'id'],
        rowCount: true,
        filters: [{ column: 'active', operator: 'is_false' }],
        aggregations: [{ column: 'id', function: 'SUM' }],
      });

      expect(rows).toHaveLength(1);
      const row = rows[0];
      expect(row.active).toBe('false');
      expect(Number(row['id | SUM'])).toBe(2);
      expect(Number(row['Row Count'])).toBe(1);
    }, 60000);

    // Case 10 — ORDER BY aggregated alias (SUM desc) + limit 1 returns larger group.
    // active=true SUM=8 > active=false SUM=2 → limit 1 returns active=true.
    it('ORDER BY aggregated alias (SUM desc) + limit 1 returns the active=true group', async () => {
      const rows = await runWithAggregations({
        columns: ['active', 'id'],
        aggregations: [{ column: 'id', function: 'SUM' }],
        sort: [{ column: 'id', direction: 'desc' }],
        limit: 1,
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].active).toBe('true');
      expect(Number(rows[0]['id | SUM'])).toBe(8);
    }, 60000);
  });
});

// ---------------------------------------------------------------------------
// Operator-matrix + relative_date + wildcard-literal safety (separate seed)
// ---------------------------------------------------------------------------
// Uses its OWN table (MATRIX_TABLE_SUFFIX) and beforeAll/afterAll so that the
// 4-row assertions in the suite above remain untouched.

const MATRIX_TABLE_SUFFIX = `op_matrix_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const MATRIX_S3_PREFIX = `integration-test/${MATRIX_TABLE_SUFFIX}/`;

describeIfCredentials('Output controls — operator matrix & dates (real Athena)', () => {
  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let credentials: AthenaCredentials;
  let config: AthenaConfig;
  let database: string;

  const builder = new AthenaQueryBuilder(new AthenaClauseRenderer());
  const definition: TableDefinition = {
    get fullyQualifiedName() {
      return `${database}.${MATRIX_TABLE_SUFFIX}`;
    },
  };

  // Builds SQL+params via the query builder and executes on real Athena,
  // returning row objects keyed by column name (header row is sliced off).
  async function runMatrix(
    queryOptions: Parameters<AthenaQueryBuilder['buildQuery']>[1]
  ): Promise<Record<string, string | undefined>[]> {
    const built = builder.buildQuery(definition, queryOptions);
    if (typeof built === 'string')
      throw new Error('expected QueryBuildResult with output controls');
    const { queryExecutionId } = await adapter.executeQuery(
      built.sql,
      config.outputBucket,
      `${MATRIX_S3_PREFIX}op-matrix/`,
      built.params
    );
    await adapter.waitForQueryToComplete(queryExecutionId);
    const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
    const rows = results.ResultSet?.Rows ?? [];
    const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
    return rows.slice(1).map(r => {
      const obj: Record<string, string | undefined> = {};
      columnInfo.forEach((col, i) => {
        obj[col.Name!] = r.Data?.[i]?.VarCharValue;
      });
      return obj;
    });
  }

  // Sort an array of row-id strings numerically.
  function ids(rows: Record<string, string | undefined>[]): string[] {
    return rows.map(r => r.id!).sort((a, b) => Number(a) - Number(b));
  }

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

    // Pre-cleanup in case of a previous crash
    try {
      const { queryExecutionId: dropId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${MATRIX_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${MATRIX_S3_PREFIX}cleanup/`
      );
      await adapter.waitForQueryToComplete(dropId);
    } catch {
      // ignore
    }

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
    // Date expressions are anchored to the calendar year (not sliding day offsets
    // near a boundary) so the relative_date assertions hold regardless of when the
    // suite runs. Row 6 uses date_trunc('year', ...) - 6 months so it stays firmly
    // in last year all year round; a plain "-200 days" drifts into this_year past
    // ~Jul 20.
    // `created_ts` mirrors `created_at` but as a TIMESTAMP at 13:00 (NOT midnight)
    // for the "today" rows, so the relative_date half-open range is exercised on a
    // sub-day value — the case the old `= current_date` equality silently missed.
    // Row 7 is future-dated to prove the this_year / this_month UPPER BOUND excludes it.
    const ctasQuery = `CREATE TABLE "${database}"."${MATRIX_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${MATRIX_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (1, 'alpha',    'a',    10,  true,  current_date,                          date_add('hour', 13, cast(current_date AS timestamp))),
  (2, 'beta',     'b',    20,  false, date_add('day', -40, current_date),    cast(date_add('day', -40, current_date) AS timestamp)),
  (3, 'gamma',    'c',    30,  true,  date_add('day', -400, current_date),   cast(date_add('day', -400, current_date) AS timestamp)),
  (4, 'alphabet', 'a%b',  40,  true,  date_add('day', -5, current_date),     cast(date_add('day', -5, current_date) AS timestamp)),
  (5, 'ALPHA',    'a_b',  50,  false, current_date,                          date_add('hour', 13, cast(current_date AS timestamp))),
  (6, '',         'x',     0,  true,  date_add('month', -6, date_trunc('year', current_date)),  cast(date_add('month', -6, date_trunc('year', current_date)) AS timestamp)),
  (7, 'future',   'f',    70,  true,  date_add('month', 13, current_date),   cast(date_add('month', 13, current_date) AS timestamp)),
  -- Row 8: all-NULL (except id) — proves negative operators (neq/not_in/not_contains/not_regex/is_empty) keep NULL rows.
  (8, CAST(NULL AS VARCHAR), CAST(NULL AS VARCHAR), CAST(NULL AS INTEGER), CAST(NULL AS BOOLEAN), CAST(NULL AS DATE), CAST(NULL AS TIMESTAMP))
) AS t (id, name, tag, score, active, created_at, created_ts)`;

    const { queryExecutionId } = await adapter.executeQuery(
      ctasQuery,
      config.outputBucket,
      `${MATRIX_S3_PREFIX}op-matrix-ctas/`
    );
    await adapter.waitForQueryToComplete(queryExecutionId);
  }, 120000);

  afterAll(async () => {
    try {
      const { queryExecutionId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${MATRIX_TABLE_SUFFIX}\``,
        config.outputBucket,
        `${MATRIX_S3_PREFIX}op-matrix-drop/`
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
    } catch (error) {
      console.warn('Failed to drop matrix test table:', error);
    }
    try {
      // Single scoped sweep of this run's unique root (data, ctas, op-matrix,
      // cleanup, drop query outputs all live under MATRIX_S3_PREFIX).
      await s3Adapter.cleanupOutputFiles(config.outputBucket, MATRIX_S3_PREFIX);
    } catch (error) {
      console.warn('Failed to clean up matrix S3 prefix:', error);
    }
  }, 90000);

  // --- Scalar operators on score ---

  it('neq: score != 20 → rows 1,3,4,5,6,7,8 (null-inclusive: NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'neq', value: 20 }],
    });
    expect(ids(rows)).toEqual(['1', '3', '4', '5', '6', '7', '8']);
  }, 60000);

  it('not_in: score not in (20, 30) → rows 1,4,5,6,7,8 (null-inclusive: NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'not_in', value: [20, 30] }],
    });
    expect(ids(rows)).toEqual(['1', '4', '5', '6', '7', '8']);
  }, 60000);

  it('gt: score > 30 → rows 4,5,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'gt', value: 30 }],
    });
    expect(ids(rows)).toEqual(['4', '5', '7']);
  }, 60000);

  it('lt: score < 30 → rows 1,2,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'lt', value: 30 }],
    });
    expect(ids(rows)).toEqual(['1', '2', '6']);
  }, 60000);

  it('gte: score >= 30 → rows 3,4,5,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'gte', value: 30 }],
    });
    expect(ids(rows)).toEqual(['3', '4', '5', '7']);
  }, 60000);

  it('lte: score <= 30 → rows 1,2,3,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'lte', value: 30 }],
    });
    expect(ids(rows)).toEqual(['1', '2', '3', '6']);
  }, 60000);

  // --- Substring / affix operators on name ---

  it('not_contains: name not contains "alpha" → rows 2,3,5,6,7,8 (case-sensitive; ALPHA excluded; NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_contains', value: 'alpha' }],
    });
    expect(ids(rows)).toEqual(['2', '3', '5', '6', '7', '8']);
  }, 60000);

  it('starts_with: name starts with "alpha" → rows 1,4', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'starts_with', value: 'alpha' }],
    });
    expect(ids(rows)).toEqual(['1', '4']);
  }, 60000);

  it('ends_with: name ends with "a" → rows 1,2,3 (alpha/beta/gamma all end in "a")', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'ends_with', value: 'a' }],
    });
    expect(ids(rows)).toEqual(['1', '2', '3']);
  }, 60000);

  // --- Wildcard-literal safety on tag column ---
  // tag='a%b' is row 4; tag='a_b' is row 5.
  // If % or _ were treated as SQL LIKE wildcards the wrong rows would match.
  // Using strpos means they are plain character literals — only the exact row matches.

  it('SAFETY contains "a%b" on tag → only row 4 (% is literal, not wildcard)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'contains', value: 'a%b' }],
    });
    expect(ids(rows)).toEqual(['4']);
  }, 60000);

  it('SAFETY contains "a_b" on tag → only row 5 (_ is literal, not wildcard)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'contains', value: 'a_b' }],
    });
    expect(ids(rows)).toEqual(['5']);
  }, 60000);

  it('SAFETY starts_with "a%b" on tag → only row 4', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'starts_with', value: 'a%b' }],
    });
    expect(ids(rows)).toEqual(['4']);
  }, 60000);

  it('SAFETY ends_with "a_b" on tag → only row 5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'tag', operator: 'ends_with', value: 'a_b' }],
    });
    expect(ids(rows)).toEqual(['5']);
  }, 60000);

  // --- Regex operators on name ---
  // Trino regexp_like uses Java regex — case-sensitive by default.
  // '^alpha' matches 'alpha' (row 1) and 'alphabet' (row 4), NOT 'ALPHA' (row 5).

  it('regex: name matches "^alpha" → rows 1,4 (case-sensitive)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'regex', value: '^alpha' }],
    });
    expect(ids(rows)).toEqual(['1', '4']);
  }, 60000);

  it('not_regex: name not matching "^alpha" → rows 2,3,5,6,7,8 (null-inclusive: NULL row 8 kept)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_regex', value: '^alpha' }],
    });
    expect(ids(rows)).toEqual(['2', '3', '5', '6', '7', '8']);
  }, 60000);

  // --- No-value operators ---

  it('is_empty on name → rows 6,8 (empty string + NULL; is_empty is null-inclusive)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_empty' }],
    });
    expect(ids(rows)).toEqual(['6', '8']);
  }, 60000);

  it('is_not_empty on name → rows 1,2,3,4,5,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_not_empty' }],
    });
    expect(ids(rows)).toEqual(['1', '2', '3', '4', '5', '7']);
  }, 60000);

  it('is_null on name → row 8 (the NULL-seeded row)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_null' }],
    });
    expect(ids(rows)).toEqual(['8']);
  }, 60000);

  it('is_not_null on name → all 7 rows', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_not_null' }],
    });
    expect(ids(rows)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  }, 60000);

  it('is_true on active → rows 1,3,4,6,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'active', operator: 'is_true' }],
    });
    expect(ids(rows)).toEqual(['1', '3', '4', '6', '7']);
  }, 60000);

  it('is_false on active → rows 2,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'active', operator: 'is_false' }],
    });
    expect(ids(rows)).toEqual(['2', '5']);
  }, 60000);

  // --- relative_date on created_at (DATE column) ---
  // Row dates (relative to test run date):
  //   1 → today            5 → today
  //   4 → -5 days          2 → -40 days
  //   6 → mid last year    3 → -400 days
  //
  // today    → rows dated current_date → [1, 5]
  // last_n_days(7) → >= current_date - 7 days → [1, 4, 5]
  // last_n_months(3) → -40 days (~1.3 months) included → [1, 2, 4, 5]
  // this_year → whole calendar year: today rows (1,5) in, other-year rows
  //   (3 & 6 last year, 7 next year) out. Recent rows 2 & 4 are NOT asserted for
  //   this_year — they legitimately leave it in early January (see the calendar
  //   invariants in relative-date-seed-invariants.spec.ts).

  it('relative_date today on created_at → rows 1,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_at', operator: 'relative_date', value: { kind: 'today' } }],
    });
    expect(ids(rows)).toEqual(['1', '5']);
  }, 60000);

  // Regression guard for the midnight-equality bug: rows 1 and 5 are stamped TODAY
  // at 13:00. The old `created_ts = current_date` form coerces DATE→TIMESTAMP at
  // midnight and returns NOTHING; the half-open range matches the whole day.
  it('relative_date today on a non-midnight TIMESTAMP column → rows 1,5 (half-open range)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_ts', operator: 'relative_date', value: { kind: 'today' } }],
      columnTypes: new Map([['created_ts', 'TIMESTAMP']]),
    });
    expect(ids(rows)).toEqual(['1', '5']);
  }, 60000);

  // The same TIMESTAMP column with a date-only value must run (CAST(? AS TIMESTAMP))
  // and behave as a range bound — proves the cast path on a real sub-day column.
  it('date gte on a non-midnight TIMESTAMP column → all seeded rows >= 2024-01-01', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_ts', operator: 'gte', value: '2024-01-01' }],
      columnTypes: new Map([['created_ts', 'TIMESTAMP']]),
    });
    // every seeded row (including future row 7) is >= 2024-01-01, so this mainly
    // proves CAST(? AS TIMESTAMP) parses and runs against a real TIMESTAMP column
    // carrying a time component.
    expect(ids(rows)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  }, 60000);

  it('relative_date last_n_days(7) on created_at → rows 1,4,5 (upper bound excludes future row 7)', async () => {
    const rows = await runMatrix({
      filters: [
        { column: 'created_at', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
      ],
    });
    // Bounded `< tomorrow`: future row 7 (+13 months) is excluded.
    expect(ids(rows)).not.toContain('7');
    expect(ids(rows)).toEqual(['1', '4', '5']);
  }, 60000);

  it('relative_date this_year on created_at → current-year rows in, other-year rows out', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_at', operator: 'relative_date', value: { kind: 'this_year' } }],
    });
    const got = ids(rows);
    // today rows are always in the current calendar year
    expect(got).toContain('1');
    expect(got).toContain('5');
    // other-year rows must never appear: rows 3 (-400d) & 6 (mid last year) are last
    // year; row 7 (+13m) is next year — the this_year UPPER BOUND excludes it.
    // Recent rows 2 (-40d) & 4 (-5d) are intentionally not asserted here — they
    // legitimately leave this_year in early January (covered by last_n_days/months).
    expect(got).not.toContain('3');
    expect(got).not.toContain('6');
    expect(got).not.toContain('7');
  }, 60000);

  it('relative_date last_n_months(3) on created_at → rows 1,2,4,5 (upper bound excludes future row 7)', async () => {
    // -40 days is within 3 months → row 2 included too.
    // Bounded `< tomorrow`: future row 7 (+13 months) is excluded.
    const rows = await runMatrix({
      filters: [
        {
          column: 'created_at',
          operator: 'relative_date',
          value: { kind: 'last_n_months', n: 3 },
        },
      ],
    });
    expect(ids(rows)).not.toContain('7');
    expect(ids(rows)).toEqual(['1', '2', '4', '5']);
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
// Blended pre-join SLICE — proves a pre-join filter narrows a JOINED data mart
// inside its `<alias>_raw` CTE on REAL Athena (separate seed: two tables).
// ---------------------------------------------------------------------------
// A "slice" is a FilterRule with placement:'pre-join' identified by the unified
// column name (<aliasPath>__<rawColumn>), injected as a WHERE INSIDE the joined
// subsidiary mart's `<alias>_raw` CTE — BEFORE the JOIN.
// This suite seeds two related tables and executes the builder's SQL on real
// Athena to prove the join result is narrowed exactly as if the joined dimension
// had been reduced upstream.
//
// Seed:
//   orders(order_id, user_id, amount): (1,10,100) (2,20,200) (3,10,300) (4,30,400)
//   users(user_id, role, country):     (10,'admin','US') (20,'viewer','US') (30,'admin','DE')
//
// Subsidiaries are LEFT JOINed, so a pre-join slice does NOT by itself drop home
// rows — it narrows the `users_raw` CTE so unmatched orders get NULL role. We
// assert both behaviours:
//   - slice alone → order 2 (user20 viewer) survives with role=NULL; 1,3,4 keep 'admin'.
//   - slice + post-join `role IS NOT NULL` → order 2 eliminated; result = {1,3,4}.

const BLEND_RUN_SUFFIX = `blend_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BLEND_ORDERS_SUFFIX = `blend_orders_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BLEND_USERS_SUFFIX = `blend_users_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
// Block-level root for all shared op outputs (cleanup/ctas/drop/query results).
const BLEND_S3_PREFIX = `integration-test/${BLEND_RUN_SUFFIX}/`;
const BLEND_ORDERS_S3_PREFIX = `integration-test/${BLEND_ORDERS_SUFFIX}/`;
const BLEND_USERS_S3_PREFIX = `integration-test/${BLEND_USERS_SUFFIX}/`;

describeIfCredentials(
  'Blended pre-join slice narrows joined mart in *_raw CTE (real Athena)',
  () => {
    let adapter: AthenaApiAdapter;
    let s3Adapter: S3ApiAdapter;
    let credentials: AthenaCredentials;
    let config: AthenaConfig;
    let database: string;

    const builder = new AthenaBlendedQueryBuilder(new AthenaClauseRenderer());

    // Relationship: orders.user_id = users.user_id, projecting users.role (MAX agg
    // so the single matching role per user_id survives the GROUP BY).
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

    // Build a BlendedQueryContext pointed at the REAL seeded tables.
    function blendContext(over: Partial<BlendedQueryContext> = {}): BlendedQueryContext {
      const fieldIndex = buildBlendedFieldIndex({
        blendedFields: [
          { name: 'users__role', aliasPath: 'users', originalFieldName: 'role', type: 'STRING' },
        ],
        availableSources: [{ aliasPath: 'users', isIncluded: true }],
      } as never);
      return {
        mainTableReference: `"${database}"."${BLEND_ORDERS_SUFFIX}"`,
        mainDataMartTitle: 'Orders',
        mainDataMartUrl: 'http://x/orders',
        chains: [
          {
            relationship: usersRelationship(),
            targetTableReference: `"${database}"."${BLEND_USERS_SUFFIX}"`,
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

    // Build SQL+params via the blended builder, run on real Athena, return rows
    // keyed by column name (header row sliced off, mirroring AthenaReportReader).
    async function runBlend(
      context: BlendedQueryContext
    ): Promise<Record<string, string | undefined>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { queryExecutionId } = await adapter.executeQuery(
        sql,
        config.outputBucket,
        `${BLEND_S3_PREFIX}blend-slice/`,
        params
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
      const rows = results.ResultSet?.Rows ?? [];
      const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      return rows.slice(1).map(r => {
        const obj: Record<string, string | undefined> = {};
        columnInfo.forEach((col, i) => {
          obj[col.Name!] = r.Data?.[i]?.VarCharValue;
        });
        return obj;
      });
    }

    function ids(rows: Record<string, string | undefined>[]): string[] {
      return rows.map(r => r.order_id!).sort((a, b) => Number(a) - Number(b));
    }

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

      // Pre-cleanup in case of a previous crash
      for (const suffix of [BLEND_ORDERS_SUFFIX, BLEND_USERS_SUFFIX]) {
        try {
          const { queryExecutionId: dropId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${BLEND_S3_PREFIX}cleanup/`
          );
          await adapter.waitForQueryToComplete(dropId);
        } catch {
          // ignore
        }
      }

      const ordersCtas = `CREATE TABLE "${database}"."${BLEND_ORDERS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${BLEND_ORDERS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (1, 10, 100),
  (2, 20, 200),
  (3, 10, 300),
  (4, 30, 400)
) AS t (order_id, user_id, amount)`;

      const usersCtas = `CREATE TABLE "${database}"."${BLEND_USERS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${BLEND_USERS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (10, 'admin',  'US'),
  (20, 'viewer', 'US'),
  (30, 'admin',  'DE')
) AS t (user_id, role, country)`;

      const { queryExecutionId: ordersId } = await adapter.executeQuery(
        ordersCtas,
        config.outputBucket,
        `${BLEND_S3_PREFIX}blend-orders-ctas/`
      );
      await adapter.waitForQueryToComplete(ordersId);

      const { queryExecutionId: usersId } = await adapter.executeQuery(
        usersCtas,
        config.outputBucket,
        `${BLEND_S3_PREFIX}blend-users-ctas/`
      );
      await adapter.waitForQueryToComplete(usersId);
    }, 180000);

    afterAll(async () => {
      for (const suffix of [BLEND_ORDERS_SUFFIX, BLEND_USERS_SUFFIX]) {
        try {
          const { queryExecutionId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${BLEND_S3_PREFIX}blend-drop/`
          );
          await adapter.waitForQueryToComplete(queryExecutionId);
        } catch (error) {
          console.warn(`Failed to drop blend table ${suffix}:`, error);
        }
      }
      try {
        // Sweep only this block's unique roots: the shared-op root plus the two
        // per-table data roots (each derived from a unique per-run suffix).
        await s3Adapter.cleanupOutputFiles(config.outputBucket, BLEND_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, BLEND_ORDERS_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, BLEND_USERS_S3_PREFIX);
      } catch (error) {
        console.warn('Failed to clean up blend S3 prefixes:', error);
      }
    }, 120000);

    it('BASELINE (no slice): every order carries its joined user role', async () => {
      const rows = await runBlend(blendContext());
      expect(ids(rows)).toEqual(['1', '2', '3', '4']);
      const roleByOrder = Object.fromEntries(rows.map(r => [r.order_id, r.role]));
      expect(roleByOrder).toEqual({
        '1': 'admin', // user 10
        '2': 'viewer', // user 20
        '3': 'admin', // user 10
        '4': 'admin', // user 30
      });
    }, 120000);

    it('SLICE (pre-join role=admin): users_raw narrowed BEFORE join → order 2 (viewer) gets NULL role', async () => {
      // The pre-join filter lives INSIDE the users_raw CTE, so user 20 (viewer) is
      // removed from the joined dimension upstream. Because the join is a LEFT JOIN,
      // order 2 still appears but with role=NULL (its match was sliced away).
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
      expect(ids(rows)).toEqual(['1', '2', '3', '4']);
      const roleByOrder = Object.fromEntries(rows.map(r => [r.order_id, r.role]));
      // Admins (users 10, 30) keep their role; viewer (user 20 → order 2) is NULL.
      expect(roleByOrder['1']).toBe('admin');
      expect(roleByOrder['3']).toBe('admin');
      expect(roleByOrder['4']).toBe('admin');
      expect(roleByOrder['2']).toBeUndefined(); // NULL → no VarCharValue
    }, 120000);

    it('SLICE + post-join (role IS NOT NULL): joined dimension narrowed → result set {1,3,4}, order 2 eliminated', async () => {
      // Combines a pre-join slice (inside users_raw CTE, param first) with a
      // post-join WHERE on the final SELECT (param last) — proving the pre-join
      // slice narrows the joined mart AND that positional param order holds live.
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
      // Only orders whose joined user survived the pre-join slice as admin remain:
      // user 10 → orders 1,3; user 30 → order 4. Order 2 (viewer) is gone.
      expect(ids(rows)).toEqual(['1', '3', '4']);
      expect(rows.every(r => r.role === 'admin')).toBe(true);
    }, 120000);

    it('SLICE (pre-join role=viewer): only order 2 keeps a role; admins NULLed out', async () => {
      // Inverse slice — narrows users_raw to viewers only. Proves the slice value
      // actually drives which joined rows survive, not just "any non-empty filter".
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
      expect(ids(rows)).toEqual(['2']);
      expect(rows[0]?.role).toBe('viewer');
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// Blended POST-JOIN aggregation — the canonical composite-key funnel on REAL
// Athena. This path (an outer GROUP BY over a joined/blended result) had only
// ever been exercised by unit string-tests; it had NEVER run against real
// Athena. The same class of gap previously hid the `(aggregated by SUM)` parens
// bug, so the value here is real Trino/Presto execution, not string-matching.
// Uses its OWN two seeded tables + beforeAll/afterAll.
// ---------------------------------------------------------------------------
// Seed (composite-key, pre-aggregated marts → 1-to-1 join, no row multiplication).
// Column is `dt` (not `date`: DATE is a Trino/Athena reserved keyword):
//   sessions(dt, channel, sessions): ('2024-01-01','paid',100) ('2024-01-01','organic',50)
//   events(dt, channel, events):     ('2024-01-01','paid',10)  ('2024-01-01','organic',5)
//
// Join on the COMPOSITE key (dt AND channel). The events CTE rolls up SUM by
// (dt,channel) — identity here, one row per key — then main LEFT JOINs it.
// The outer SELECT groups by channel with SUM(sessions) + SUM(events). If the
// join fanned out, sessions would be inflated; it must stay 100/50.

const BLEND_AGG_RUN_SUFFIX = `blend_agg_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BLEND_AGG_SESSIONS_SUFFIX = `blend_agg_sessions_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BLEND_AGG_EVENTS_SUFFIX = `blend_agg_events_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
// Block-level root for all shared op outputs (cleanup/ctas/drop/query results).
const BLEND_AGG_S3_PREFIX = `integration-test/${BLEND_AGG_RUN_SUFFIX}/`;
const BLEND_AGG_SESSIONS_S3_PREFIX = `integration-test/${BLEND_AGG_SESSIONS_SUFFIX}/`;
const BLEND_AGG_EVENTS_S3_PREFIX = `integration-test/${BLEND_AGG_EVENTS_SUFFIX}/`;

describeIfCredentials('Blended post-join aggregation — composite-key funnel (real Athena)', () => {
  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let credentials: AthenaCredentials;
  let config: AthenaConfig;
  let database: string;

  const builder = new AthenaBlendedQueryBuilder(new AthenaClauseRenderer());

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
        { name: 'events', aliasPath: 'events', originalFieldName: 'events', type: 'INTEGER' },
      ],
      availableSources: [{ aliasPath: 'events', isIncluded: true }],
    } as never);
    return {
      mainTableReference: `"${database}"."${BLEND_AGG_SESSIONS_SUFFIX}"`,
      mainDataMartTitle: 'Sessions',
      mainDataMartUrl: 'http://x/sessions',
      chains: [
        {
          relationship: eventsRelationship([
            { sourceFieldName: 'dt', targetFieldName: 'dt' },
            { sourceFieldName: 'channel', targetFieldName: 'channel' },
          ]),
          targetTableReference: `"${database}"."${BLEND_AGG_EVENTS_SUFFIX}"`,
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

  // Build SQL+params via the blended builder, run on real Athena, return rows
  // keyed by column name (header row sliced off, mirroring AthenaReportReader).
  // Athena uses POSITIONAL params, so we pass both sql AND params.
  async function runBlend(
    context: BlendedQueryContext
  ): Promise<Record<string, string | undefined>[]> {
    const { sql, params } = builder.buildBlendedQuery(context);
    const { queryExecutionId } = await adapter.executeQuery(
      sql,
      config.outputBucket,
      `${BLEND_AGG_S3_PREFIX}blend-funnel/`,
      params
    );
    await adapter.waitForQueryToComplete(queryExecutionId);
    const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
    const rows = results.ResultSet?.Rows ?? [];
    const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
    return rows.slice(1).map(r => {
      const obj: Record<string, string | undefined> = {};
      columnInfo.forEach((col, i) => {
        obj[col.Name!] = r.Data?.[i]?.VarCharValue;
      });
      return obj;
    });
  }

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

    // Pre-cleanup in case of a previous crash
    for (const suffix of [BLEND_AGG_SESSIONS_SUFFIX, BLEND_AGG_EVENTS_SUFFIX]) {
      try {
        const { queryExecutionId: dropId } = await adapter.executeQuery(
          `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
          config.outputBucket,
          `${BLEND_AGG_S3_PREFIX}cleanup/`
        );
        await adapter.waitForQueryToComplete(dropId);
      } catch {
        // ignore
      }
    }

    const sessionsCtas = `CREATE TABLE "${database}"."${BLEND_AGG_SESSIONS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${BLEND_AGG_SESSIONS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (DATE '2024-01-01', 'paid',    100),
  (DATE '2024-01-01', 'organic', 50)
) AS t (dt, channel, sessions)`;

    const eventsCtas = `CREATE TABLE "${database}"."${BLEND_AGG_EVENTS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${BLEND_AGG_EVENTS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (DATE '2024-01-01', 'paid',    10),
  (DATE '2024-01-01', 'organic', 5)
) AS t (dt, channel, events)`;

    const { queryExecutionId: sessionsId } = await adapter.executeQuery(
      sessionsCtas,
      config.outputBucket,
      `${BLEND_AGG_S3_PREFIX}blend-sessions-ctas/`
    );
    await adapter.waitForQueryToComplete(sessionsId);

    const { queryExecutionId: eventsId } = await adapter.executeQuery(
      eventsCtas,
      config.outputBucket,
      `${BLEND_AGG_S3_PREFIX}blend-events-ctas/`
    );
    await adapter.waitForQueryToComplete(eventsId);
  }, 180000);

  afterAll(async () => {
    for (const suffix of [BLEND_AGG_SESSIONS_SUFFIX, BLEND_AGG_EVENTS_SUFFIX]) {
      try {
        const { queryExecutionId } = await adapter.executeQuery(
          `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
          config.outputBucket,
          `${BLEND_AGG_S3_PREFIX}blend-drop/`
        );
        await adapter.waitForQueryToComplete(queryExecutionId);
      } catch (error) {
        console.warn(`Failed to drop blend-agg table ${suffix}:`, error);
      }
    }
    try {
      // Sweep only this block's unique roots: the shared-op root plus the two
      // per-table data roots (each derived from a unique per-run suffix).
      await s3Adapter.cleanupOutputFiles(config.outputBucket, BLEND_AGG_S3_PREFIX);
      await s3Adapter.cleanupOutputFiles(config.outputBucket, BLEND_AGG_SESSIONS_S3_PREFIX);
      await s3Adapter.cleanupOutputFiles(config.outputBucket, BLEND_AGG_EVENTS_S3_PREFIX);
    } catch (error) {
      console.warn('Failed to clean up blend-agg S3 prefixes:', error);
    }
  }, 120000);

  // The headline case: the composite-key join is 1-to-1, so the outer GROUP BY
  // yields exactly one row per channel with un-inflated SUM(sessions) and the
  // joined SUM(events). A fan-out would multiply sessions; the assertion would
  // then fail (which is the entire point of running this for real). Athena
  // returns aggregate values as strings via VarCharValue, so Number(...) them;
  // the emitted alias case is preserved → keys are 'sessions | SUM'.
  it('composite-key (dt AND channel) post-join SUM stays 1-to-1: paid 100/10, organic 50/5', async () => {
    const rows = await runBlend(compositeContext());

    expect(rows).toHaveLength(2);
    const byChannel = new Map(rows.map(r => [r.channel, r]));

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
  // executes and aggregates correctly on real Athena too.
  it('single-key (channel only) post-join SUM also executes 1-to-1: paid 100/10, organic 50/5', async () => {
    const context = compositeContext();
    context.chains[0].relationship = eventsRelationship([
      { sourceFieldName: 'channel', targetFieldName: 'channel' },
    ]);

    const rows = await runBlend(context);

    expect(rows).toHaveLength(2);
    const byChannel = new Map(rows.map(r => [r.channel, r]));

    const paid = byChannel.get('paid')!;
    expect(Number(paid['sessions | SUM'])).toBe(100);
    expect(Number(paid['events | SUM'])).toBe(10);

    const organic = byChannel.get('organic')!;
    expect(Number(organic['sessions | SUM'])).toBe(50);
    expect(Number(organic['events | SUM'])).toBe(5);
  }, 120000);
});

// ---------------------------------------------------------------------------
// Blended COUNT_DISTINCT through a bridge — "metric sleeve" fix (, real
// Athena). This proves the N-hop NESTED-bridge variant: a 2-hop chain
// events -> users -> organizations, where `organizations` is a CHILD of
// `users` (org_id lives on users), NOT a sibling of it. Main = events
// (bridge/fact grain); `users` is a ROOT chain off main (dimension: country);
// `organizations` hangs off users (metric: distinct org count). Because the
// metric column is two hops from main, the sleeve must re-join BOTH raw CTEs
// (Task 3's N-hop ancestor closure) — that closure is exactly what this case
// exercises against real Athena (Trino/Presto dialect).
//
// Before this fix, a joined COUNT_DISTINCT metric was read off the bottom-up
// dedup CTE chain, where each intermediate level collapses multiple raw rows
// per parent-join-key via ANY_VALUE/MAX (arbitrary() on Trino) — the SAME
// collapse additive/idempotent metrics rely on. That collapse is lossless
// ONLY when a join key maps to exactly one raw value; it breaks the moment a
// user genuinely belongs to more than one org: arbitrary(orgId) silently
// keeps just ONE of the user's orgs and drops the rest, so the OLD path
// UNDER-counts the report's COUNT_DISTINCT (this nested topology). The sleeve
// fixes it by re-joining the RAW (pre-dedup) path and counting distinct at
// the report's OWN dimension grain, bypassing every intermediate collapse.
// Uses its OWN 3 seeded tables + beforeAll/afterAll (see the reference
// scenario/seed in bigquery.integration.ts's case).
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

const BRIDGE_RUN_SUFFIX = `bridge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BRIDGE_EVENTS_SUFFIX = `bridge_events_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BRIDGE_USERS_SUFFIX = `bridge_users_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BRIDGE_ORGS_SUFFIX = `bridge_orgs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const BRIDGE_S3_PREFIX = `integration-test/${BRIDGE_RUN_SUFFIX}/`;
const BRIDGE_EVENTS_S3_PREFIX = `integration-test/${BRIDGE_EVENTS_SUFFIX}/`;
const BRIDGE_USERS_S3_PREFIX = `integration-test/${BRIDGE_USERS_SUFFIX}/`;
const BRIDGE_ORGS_S3_PREFIX = `integration-test/${BRIDGE_ORGS_SUFFIX}/`;

describeIfCredentials(
  'Blended COUNT_DISTINCT through a bridge — metric sleeve (real Athena)',
  () => {
    let adapter: AthenaApiAdapter;
    let s3Adapter: S3ApiAdapter;
    let credentials: AthenaCredentials;
    let config: AthenaConfig;
    let database: string;

    const builder = new AthenaBlendedQueryBuilder(new AthenaClauseRenderer());

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
        mainTableReference: `"${database}"."${BRIDGE_EVENTS_SUFFIX}"`,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: bridgeRelationship('rel-users', 'users', [
              { sourceFieldName: 'user_id', targetFieldName: 'userId' },
            ]),
            targetTableReference: `"${database}"."${BRIDGE_USERS_SUFFIX}"`,
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
            targetTableReference: `"${database}"."${BRIDGE_ORGS_SUFFIX}"`,
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

    // Build SQL+params via the blended builder, run on real Athena, return rows
    // keyed by column name (header row sliced off, mirroring AthenaReportReader).
    async function runBlend(
      context: BlendedQueryContext
    ): Promise<Record<string, string | undefined>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { queryExecutionId } = await adapter.executeQuery(
        sql,
        config.outputBucket,
        `${BRIDGE_S3_PREFIX}bridge/`,
        params
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
      const rows = results.ResultSet?.Rows ?? [];
      const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      return rows.slice(1).map(r => {
        const obj: Record<string, string | undefined> = {};
        columnInfo.forEach((col, i) => {
          obj[col.Name!] = r.Data?.[i]?.VarCharValue;
        });
        return obj;
      });
    }

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

      // Pre-cleanup in case of a previous crash
      for (const suffix of [BRIDGE_EVENTS_SUFFIX, BRIDGE_USERS_SUFFIX, BRIDGE_ORGS_SUFFIX]) {
        try {
          const { queryExecutionId: dropId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${BRIDGE_S3_PREFIX}cleanup/`
          );
          await adapter.waitForQueryToComplete(dropId);
        } catch {
          // ignore
        }
      }

      const eventsCtas = `CREATE TABLE "${database}"."${BRIDGE_EVENTS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${BRIDGE_EVENTS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('e1','u1'), ('e2','u1'), ('e3','u2'),
  ('e4','u3'), ('e5','u3'),
  ('e6','u4'), ('e7','u4'), ('e8','u5')
) AS t (event_id, user_id)`;

      // u1 genuinely belongs to TWO orgs (o1 AND o4) — the fan-out that breaks the
      // pre-fix dedup-then-read mechanism (see block comment above).
      const usersCtas = `CREATE TABLE "${database}"."${BRIDGE_USERS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${BRIDGE_USERS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('u1','US','o1'), ('u1','US','o4'),
  ('u2','US','o5'),
  ('u3','DE','o2'),
  ('u4','UA','o3'),
  ('u5','PL','o3')
) AS t (userId, country, org_id)`;

      const organizationsCtas = `CREATE TABLE "${database}"."${BRIDGE_ORGS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${BRIDGE_ORGS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('o1'), ('o2'), ('o3'), ('o4'), ('o5')
) AS t (orgId)`;

      const { queryExecutionId: eventsId } = await adapter.executeQuery(
        eventsCtas,
        config.outputBucket,
        `${BRIDGE_S3_PREFIX}bridge-events-ctas/`
      );
      await adapter.waitForQueryToComplete(eventsId);

      const { queryExecutionId: usersId } = await adapter.executeQuery(
        usersCtas,
        config.outputBucket,
        `${BRIDGE_S3_PREFIX}bridge-users-ctas/`
      );
      await adapter.waitForQueryToComplete(usersId);

      const { queryExecutionId: orgsId } = await adapter.executeQuery(
        organizationsCtas,
        config.outputBucket,
        `${BRIDGE_S3_PREFIX}bridge-orgs-ctas/`
      );
      await adapter.waitForQueryToComplete(orgsId);
    }, 180000);

    afterAll(async () => {
      for (const suffix of [BRIDGE_EVENTS_SUFFIX, BRIDGE_USERS_SUFFIX, BRIDGE_ORGS_SUFFIX]) {
        try {
          const { queryExecutionId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${BRIDGE_S3_PREFIX}bridge-drop/`
          );
          await adapter.waitForQueryToComplete(queryExecutionId);
        } catch (error) {
          console.warn(`Failed to drop bridge table ${suffix}:`, error);
        }
      }
      try {
        // Sweep only this block's unique roots: the shared-op root plus the
        // three per-table data roots (each derived from a unique per-run suffix).
        await s3Adapter.cleanupOutputFiles(config.outputBucket, BRIDGE_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, BRIDGE_EVENTS_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, BRIDGE_USERS_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, BRIDGE_ORGS_S3_PREFIX);
      } catch (error) {
        console.warn('Failed to clean up bridge S3 prefixes:', error);
      }
    }, 120000);

    it('fan-out: joined COUNT DISTINCT is correct through a bridge (sleeve): US=3, DE=1, UA=1, PL=1', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(4);
      const byCountry = new Map(
        rows.map(r => [r.users__country, Number(r['organizations__orgId | COUNTUNIQUE'])])
      );

      // THE headline case (under-counted pre-fix): u1 genuinely belongs to TWO
      // orgs (o1, o4); u2 belongs to a third (o5) — US must show all 3, not the
      // pre-fix arbitrary()-collapsed 2.
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
  }
);

// ---------------------------------------------------------------------------
// Blended SUM/AVG through a bridge — value sleeve set-based proof (5,
// real Athena). Mirrors bigquery.integration.ts's C2.4 bridge SUM/AVG case
// exactly (same topology, seed, and ground truth) against the Trino/Presto
// dialect — this is the critical cross-dialect proof that `buildRowSurrogate()`
// (`ROW_NUMBER() OVER (ORDER BY 1)`, the base-class default) parses and
// executes on Athena.
//
// Topology: main = items (an order/product bridge table). TWO sibling chains
// off main: products (dimension: category) and orders (metric: revenue,
// aggregated post-join as SUM/AVG).
//
// Seed (identical to the BigQuery C2.4 fixture):
//   orders(orderId, revenue):      o1=100, o2=50, o3=30
//   products(productId, category): pA=Supplements, pB=Supplements, pC=Gear
//   items(itemId, orderId, productId):
//     i1 o1 pA · i2 o1 pC   (o1 touches BOTH categories)
//     i3 o2 pA · i4 o2 pB   (o2 touches Supplements via TWO products — the fan-out)
//     i5 o3 pC
//
// Ground truth per category (an order's revenue counts ONCE per category it
// touches): Supplements SUM=150/AVG=75 {o1,o2}; Gear SUM=130/AVG=65 {o1,o3}
// (control — no repeated order per category, naive and correct coincide).
// Naive dedup-then-re-aggregate would return Supplements SUM=200/AVG=66.67
// (double-counts o2's two item-rows).

const SUMAVG_BRIDGE_RUN_SUFFIX = `sumavg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SUMAVG_ITEMS_SUFFIX = `sumavg_items_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SUMAVG_ORDERS_SUFFIX = `sumavg_orders_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SUMAVG_PRODUCTS_SUFFIX = `sumavg_products_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SUMAVG_S3_PREFIX = `integration-test/${SUMAVG_BRIDGE_RUN_SUFFIX}/`;
const SUMAVG_ITEMS_S3_PREFIX = `integration-test/${SUMAVG_ITEMS_SUFFIX}/`;
const SUMAVG_ORDERS_S3_PREFIX = `integration-test/${SUMAVG_ORDERS_SUFFIX}/`;
const SUMAVG_PRODUCTS_S3_PREFIX = `integration-test/${SUMAVG_PRODUCTS_SUFFIX}/`;

describeIfCredentials('Blended SUM/AVG through a bridge — value sleeve (5, real Athena)', () => {
  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let credentials: AthenaCredentials;
  let config: AthenaConfig;
  let database: string;

  const builder = new AthenaBlendedQueryBuilder(new AthenaClauseRenderer());

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
  // revenue) — BOTH chains are roots off main (siblings).
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
      mainTableReference: `"${database}"."${SUMAVG_ITEMS_SUFFIX}"`,
      mainDataMartTitle: 'Items',
      mainDataMartUrl: 'http://x/items',
      chains: [
        {
          relationship: bridgeRelationship('rel-products', 'products', [
            { sourceFieldName: 'productId', targetFieldName: 'productId' },
          ]),
          targetTableReference: `"${database}"."${SUMAVG_PRODUCTS_SUFFIX}"`,
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
          targetTableReference: `"${database}"."${SUMAVG_ORDERS_SUFFIX}"`,
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

  async function runBlend(
    context: BlendedQueryContext
  ): Promise<Record<string, string | undefined>[]> {
    const { sql, params } = builder.buildBlendedQuery(context);
    const { queryExecutionId } = await adapter.executeQuery(
      sql,
      config.outputBucket,
      `${SUMAVG_S3_PREFIX}sumavg/`,
      params
    );
    await adapter.waitForQueryToComplete(queryExecutionId);
    const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
    const rows = results.ResultSet?.Rows ?? [];
    const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
    return rows.slice(1).map(r => {
      const obj: Record<string, string | undefined> = {};
      columnInfo.forEach((col, i) => {
        obj[col.Name!] = r.Data?.[i]?.VarCharValue;
      });
      return obj;
    });
  }

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

    // Pre-cleanup in case of a previous crash
    for (const suffix of [SUMAVG_ITEMS_SUFFIX, SUMAVG_ORDERS_SUFFIX, SUMAVG_PRODUCTS_SUFFIX]) {
      try {
        const { queryExecutionId: dropId } = await adapter.executeQuery(
          `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
          config.outputBucket,
          `${SUMAVG_S3_PREFIX}cleanup/`
        );
        await adapter.waitForQueryToComplete(dropId);
      } catch {
        // ignore
      }
    }

    const itemsCtas = `CREATE TABLE "${database}"."${SUMAVG_ITEMS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${SUMAVG_ITEMS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('i1','o1','pA'), ('i2','o1','pC'),
  ('i3','o2','pA'), ('i4','o2','pB'),
  ('i5','o3','pC')
) AS t (itemId, orderId, productId)`;

    const ordersCtas = `CREATE TABLE "${database}"."${SUMAVG_ORDERS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${SUMAVG_ORDERS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('o1', 100), ('o2', 50), ('o3', 30)
) AS t (orderId, revenue)`;

    const productsCtas = `CREATE TABLE "${database}"."${SUMAVG_PRODUCTS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${SUMAVG_PRODUCTS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('pA','Supplements'), ('pB','Supplements'), ('pC','Gear')
) AS t (productId, category)`;

    const { queryExecutionId: itemsId } = await adapter.executeQuery(
      itemsCtas,
      config.outputBucket,
      `${SUMAVG_S3_PREFIX}sumavg-items-ctas/`
    );
    await adapter.waitForQueryToComplete(itemsId);

    const { queryExecutionId: ordersId } = await adapter.executeQuery(
      ordersCtas,
      config.outputBucket,
      `${SUMAVG_S3_PREFIX}sumavg-orders-ctas/`
    );
    await adapter.waitForQueryToComplete(ordersId);

    const { queryExecutionId: productsId } = await adapter.executeQuery(
      productsCtas,
      config.outputBucket,
      `${SUMAVG_S3_PREFIX}sumavg-products-ctas/`
    );
    await adapter.waitForQueryToComplete(productsId);
  }, 180000);

  afterAll(async () => {
    for (const suffix of [SUMAVG_ITEMS_SUFFIX, SUMAVG_ORDERS_SUFFIX, SUMAVG_PRODUCTS_SUFFIX]) {
      try {
        const { queryExecutionId } = await adapter.executeQuery(
          `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
          config.outputBucket,
          `${SUMAVG_S3_PREFIX}sumavg-drop/`
        );
        await adapter.waitForQueryToComplete(queryExecutionId);
      } catch (error) {
        console.warn(`Failed to drop value-sleeve bridge table ${suffix}:`, error);
      }
    }
    try {
      await s3Adapter.cleanupOutputFiles(config.outputBucket, SUMAVG_S3_PREFIX);
      await s3Adapter.cleanupOutputFiles(config.outputBucket, SUMAVG_ITEMS_S3_PREFIX);
      await s3Adapter.cleanupOutputFiles(config.outputBucket, SUMAVG_ORDERS_S3_PREFIX);
      await s3Adapter.cleanupOutputFiles(config.outputBucket, SUMAVG_PRODUCTS_S3_PREFIX);
    } catch (error) {
      console.warn('Failed to clean up value-sleeve bridge S3 prefixes:', error);
    }
  }, 120000);

  it('fan-out: joined SUM through the bridge is set-based correct: Supplements=150 (not naive 200), Gear=130', async () => {
    const rows = await runBlend(bridgeContext('SUM'));

    expect(rows).toHaveLength(2);
    const byCategory = new Map(
      rows.map(r => [r.products__category, Number(r['orders__revenue | SUM'])])
    );

    expect(byCategory.get('Supplements')).toBe(150);
    expect(byCategory.get('Gear')).toBe(130);
  }, 120000);

  it('fan-out: joined AVG through the bridge is set-based correct: Supplements=75 (not naive avg-of-3-rows 66.67), Gear=65', async () => {
    const rows = await runBlend(bridgeContext('AVG'));

    expect(rows).toHaveLength(2);
    const byCategory = new Map(
      rows.map(r => [r.products__category, Number(r['orders__revenue | AVG'])])
    );

    expect(byCategory.get('Supplements')).toBe(75);
    expect(byCategory.get('Gear')).toBe(65);
  }, 120000);

  // 1 — MERGED VALUE sleeve, live. SUM and AVG of the SAME joined column share one
  // dedup pass: one `SELECT DISTINCT (dims, owner identity, value)` subquery with TWO outer
  // aggregates over it. Every live proof on this dialect so far ran SUM and AVG as SEPARATE
  // queries, so the merged shape — the one a Totals report actually emits for a numeric joined
  // field — was only ever checked as SQL text.
  //
  // Same ground truth as the two tests above, which is the point: merging must not move a
  // number. Supplements SUM=150/AVG=75 {o1,o2}; Gear SUM=130/AVG=65 {o1,o3}.
  it('fan-out: merged value sleeve: SUM and AVG over ONE dedup pass keep both numbers', async () => {
    const context: BlendedQueryContext = {
      ...bridgeContext('SUM'),
      aggregations: [
        { column: 'orders__revenue', function: 'SUM' },
        { column: 'orders__revenue', function: 'AVG' },
      ],
    };

    // Guard the premise: one sleeve CTE and ONE dedup pass feeding both aggregates. Without
    // this the numbers below would still pass while the merged shape went uncovered.
    const { sql } = builder.buildBlendedQuery(context);
    expect(sql.match(/SELECT DISTINCT/g)).toHaveLength(1);

    const rows = await runBlend(context);

    expect(rows).toHaveLength(2);
    const sums = new Map(rows.map(r => [r.products__category, Number(r['orders__revenue | SUM'])]));
    const avgs = new Map(rows.map(r => [r.products__category, Number(r['orders__revenue | AVG'])]));

    expect(sums.get('Supplements')).toBe(150);
    expect(sums.get('Gear')).toBe(130);
    expect(avgs.get('Supplements')).toBe(75);
    expect(avgs.get('Gear')).toBe(65);
  }, 120000);
});

// ---------------------------------------------------------------------------
// Blended SUM through a bridge — no-PK synthetic surrogate (5, real
// Athena). Mirrors bigquery.integration.ts's C2.4 no-PK surrogate case.
// Dimensionless grand total: main = items (bridge fact), one chain = orders
// (metric: SUM amount, no report GROUP BY) — exercises the sleeve's CROSS
// JOIN / ungrouped shape and the surrogate on real Athena.
//
// Seed — two DIFFERENT orders, A and B, both worth exactly $50; A is reached
// through the bridge TWICE (fanned), B once:
//   orders(orderId, amount): A=50, B=50
//   items(itemId, orderId):  i1->A, i2->A (A fans out), i3->B
// Ground truth: 50 + 50 = 100 (naive additive = 150; dedup-by-value-alone = 50).

const SUMAVG_NOPK_RUN_SUFFIX = `nopk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SUMAVG_NOPK_ITEMS_SUFFIX = `nopk_items_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SUMAVG_NOPK_ORDERS_SUFFIX = `nopk_orders_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const SUMAVG_NOPK_S3_PREFIX = `integration-test/${SUMAVG_NOPK_RUN_SUFFIX}/`;
const SUMAVG_NOPK_ITEMS_S3_PREFIX = `integration-test/${SUMAVG_NOPK_ITEMS_SUFFIX}/`;
const SUMAVG_NOPK_ORDERS_S3_PREFIX = `integration-test/${SUMAVG_NOPK_ORDERS_SUFFIX}/`;

describeIfCredentials(
  'Blended SUM through a bridge — no-PK synthetic surrogate (5, real Athena)',
  () => {
    let adapter: AthenaApiAdapter;
    let s3Adapter: S3ApiAdapter;
    let credentials: AthenaCredentials;
    let config: AthenaConfig;
    let database: string;

    const builder = new AthenaBlendedQueryBuilder(new AthenaClauseRenderer());

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
        mainTableReference: `"${database}"."${SUMAVG_NOPK_ITEMS_SUFFIX}"`,
        mainDataMartTitle: 'Items',
        mainDataMartUrl: 'http://x/items',
        chains: [
          {
            relationship: bridgeRelationship('rel-orders', 'orders', [
              { sourceFieldName: 'orderId', targetFieldName: 'orderId' },
            ]),
            targetTableReference: `"${database}"."${SUMAVG_NOPK_ORDERS_SUFFIX}"`,
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

    async function runBlend(
      context: BlendedQueryContext
    ): Promise<Record<string, string | undefined>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { queryExecutionId } = await adapter.executeQuery(
        sql,
        config.outputBucket,
        `${SUMAVG_NOPK_S3_PREFIX}nopk/`,
        params
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
      const rows = results.ResultSet?.Rows ?? [];
      const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      return rows.slice(1).map(r => {
        const obj: Record<string, string | undefined> = {};
        columnInfo.forEach((col, i) => {
          obj[col.Name!] = r.Data?.[i]?.VarCharValue;
        });
        return obj;
      });
    }

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

      for (const suffix of [SUMAVG_NOPK_ITEMS_SUFFIX, SUMAVG_NOPK_ORDERS_SUFFIX]) {
        try {
          const { queryExecutionId: dropId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${SUMAVG_NOPK_S3_PREFIX}cleanup/`
          );
          await adapter.waitForQueryToComplete(dropId);
        } catch {
          // ignore
        }
      }

      const itemsCtas = `CREATE TABLE "${database}"."${SUMAVG_NOPK_ITEMS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${SUMAVG_NOPK_ITEMS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('i1','A'), ('i2','A'), ('i3','B')
) AS t (itemId, orderId)`;

      const ordersCtas = `CREATE TABLE "${database}"."${SUMAVG_NOPK_ORDERS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${SUMAVG_NOPK_ORDERS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('A', 50), ('B', 50)
) AS t (orderId, amount)`;

      const { queryExecutionId: itemsId } = await adapter.executeQuery(
        itemsCtas,
        config.outputBucket,
        `${SUMAVG_NOPK_S3_PREFIX}nopk-items-ctas/`
      );
      await adapter.waitForQueryToComplete(itemsId);

      const { queryExecutionId: ordersId } = await adapter.executeQuery(
        ordersCtas,
        config.outputBucket,
        `${SUMAVG_NOPK_S3_PREFIX}nopk-orders-ctas/`
      );
      await adapter.waitForQueryToComplete(ordersId);
    }, 180000);

    afterAll(async () => {
      for (const suffix of [SUMAVG_NOPK_ITEMS_SUFFIX, SUMAVG_NOPK_ORDERS_SUFFIX]) {
        try {
          const { queryExecutionId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${SUMAVG_NOPK_S3_PREFIX}nopk-drop/`
          );
          await adapter.waitForQueryToComplete(queryExecutionId);
        } catch (error) {
          console.warn(`Failed to drop no-PK surrogate table ${suffix}:`, error);
        }
      }
      try {
        await s3Adapter.cleanupOutputFiles(config.outputBucket, SUMAVG_NOPK_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, SUMAVG_NOPK_ITEMS_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, SUMAVG_NOPK_ORDERS_S3_PREFIX);
      } catch (error) {
        console.warn('Failed to clean up no-PK surrogate S3 prefixes:', error);
      }
    }, 120000);

    it('fan-out: no-PK synthetic surrogate: two distinct $50 orders (one fanned) sum to 100, not naive 150 or dedup-by-value 50', async () => {
      const rows = await runBlend(bridgeContext());

      expect(rows).toHaveLength(1);
      expect(Number(rows[0]['orders__amount | SUM'])).toBe(100);
    }, 120000);
  }
);

// ---------------------------------------------------------------------------
// sleeve honours post-join FILTERS (C1) and the outer dimension GRAIN
// for a FANNING blended dimension (C2), real Athena. Mirrors
// bigquery.integration.ts's " sleeve honours post-join filters +
// fanning blended dimension" case exactly (same topology, seed, ground truth)
// against the Trino/Presto dialect. Both defects made the sleeve silently
// disagree with the outer query; prior fixtures were all 1-row-per-key with no
// filter, which hid them.
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
// Seed:
//   orders(orderId, revenue):  o1=100, o2=50, o3=30
//   labels(dimKey, label):     k1→red, k1→blue  (FANS)   ·  k2→green
//   events(eventId, dimKey, orderId, country):
//     ev1 k1 o1 US · ev2 k1 o2 DE · ev3 k2 o3 US
//
// Ground truth — group by the rolled-up label, distinct orders per bucket:
//   UNFILTERED (C2 proof, both metrics NON-NULL & correct):
//     'blue, red' (k1): orders {o1,o2} → SUM 150, COUNT_DISTINCT 2
//     'green'     (k2): order  {o3}    → SUM  30, COUNT_DISTINCT 1
//   FILTERED country='US' (C1 proof — a NON-dimension column; ev2/DE drops out):
//     'blue, red' (k1): order  {o1}    → SUM 100, COUNT_DISTINCT 1  (NOT the unfiltered 150/2)
//     'green'     (k2): order  {o3}    → SUM  30, COUNT_DISTINCT 1
// A sleeve that ignored the filter (C1 bug) would return the unfiltered 150/2
// for the 'blue, red' bucket even under the country='US' report.

const R1_RUN_SUFFIX = `r1_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const R1_EVENTS_SUFFIX = `r1_events_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const R1_LABELS_SUFFIX = `r1_labels_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const R1_ORDERS_SUFFIX = `r1_orders_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const R1_S3_PREFIX = `integration-test/${R1_RUN_SUFFIX}/`;
const R1_EVENTS_S3_PREFIX = `integration-test/${R1_EVENTS_SUFFIX}/`;
const R1_LABELS_S3_PREFIX = `integration-test/${R1_LABELS_SUFFIX}/`;
const R1_ORDERS_S3_PREFIX = `integration-test/${R1_ORDERS_SUFFIX}/`;

describeIfCredentials(
  'sleeve honours post-join filters + fanning blended dimension (real Athena)',
  () => {
    let adapter: AthenaApiAdapter;
    let s3Adapter: S3ApiAdapter;
    let credentials: AthenaCredentials;
    let config: AthenaConfig;
    let database: string;

    const builder = new AthenaBlendedQueryBuilder(new AthenaClauseRenderer());

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
        mainTableReference: `"${database}"."${R1_EVENTS_SUFFIX}"`,
        mainDataMartTitle: 'Events',
        mainDataMartUrl: 'http://x/events',
        chains: [
          {
            relationship: rel('rel-labels', 'labels', [
              { sourceFieldName: 'dimKey', targetFieldName: 'dimKey' },
            ]),
            targetTableReference: `"${database}"."${R1_LABELS_SUFFIX}"`,
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
            targetTableReference: `"${database}"."${R1_ORDERS_SUFFIX}"`,
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

    async function runBlend(
      context: BlendedQueryContext
    ): Promise<Record<string, string | undefined>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { queryExecutionId } = await adapter.executeQuery(
        sql,
        config.outputBucket,
        `${R1_S3_PREFIX}r1/`,
        params
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
      const rows = results.ResultSet?.Rows ?? [];
      const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      return rows.slice(1).map(r => {
        const obj: Record<string, string | undefined> = {};
        columnInfo.forEach((col, i) => {
          obj[col.Name!] = r.Data?.[i]?.VarCharValue;
        });
        return obj;
      });
    }

    // The rolled-up label ('blue, red') order is not guaranteed by STRING_AGG, so identify the
    // fanning bucket as the one that is NOT the lone 'green' row.
    function fanningRow(
      rows: Record<string, string | undefined>[]
    ): Record<string, string | undefined> {
      return rows.find(r => r.labels__label !== 'green')!;
    }
    function greenRow(
      rows: Record<string, string | undefined>[]
    ): Record<string, string | undefined> {
      return rows.find(r => r.labels__label === 'green')!;
    }

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

      // Pre-cleanup in case of a previous crash
      for (const suffix of [R1_EVENTS_SUFFIX, R1_LABELS_SUFFIX, R1_ORDERS_SUFFIX]) {
        try {
          const { queryExecutionId: dropId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${R1_S3_PREFIX}cleanup/`
          );
          await adapter.waitForQueryToComplete(dropId);
        } catch {
          // ignore
        }
      }

      const eventsCtas = `CREATE TABLE "${database}"."${R1_EVENTS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${R1_EVENTS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('ev1','k1','o1','US'), ('ev2','k1','o2','DE'), ('ev3','k2','o3','US')
) AS t (eventId, dimKey, orderId, country)`;

      // k1 owns TWO labels (red, blue) — the fan-out that makes the dedup roll-up non-identity.
      const labelsCtas = `CREATE TABLE "${database}"."${R1_LABELS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${R1_LABELS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('k1','red'), ('k1','blue'), ('k2','green')
) AS t (dimKey, label)`;

      const ordersCtas = `CREATE TABLE "${database}"."${R1_ORDERS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${R1_ORDERS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('o1', 100), ('o2', 50), ('o3', 30)
) AS t (orderId, revenue)`;

      const { queryExecutionId: eventsId } = await adapter.executeQuery(
        eventsCtas,
        config.outputBucket,
        `${R1_S3_PREFIX}r1-events-ctas/`
      );
      await adapter.waitForQueryToComplete(eventsId);

      const { queryExecutionId: labelsId } = await adapter.executeQuery(
        labelsCtas,
        config.outputBucket,
        `${R1_S3_PREFIX}r1-labels-ctas/`
      );
      await adapter.waitForQueryToComplete(labelsId);

      const { queryExecutionId: ordersId } = await adapter.executeQuery(
        ordersCtas,
        config.outputBucket,
        `${R1_S3_PREFIX}r1-orders-ctas/`
      );
      await adapter.waitForQueryToComplete(ordersId);
    }, 180000);

    afterAll(async () => {
      for (const suffix of [R1_EVENTS_SUFFIX, R1_LABELS_SUFFIX, R1_ORDERS_SUFFIX]) {
        try {
          const { queryExecutionId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${R1_S3_PREFIX}r1-drop/`
          );
          await adapter.waitForQueryToComplete(queryExecutionId);
        } catch (error) {
          console.warn(`Failed to drop R1 fixture table ${suffix}:`, error);
        }
      }
      try {
        await s3Adapter.cleanupOutputFiles(config.outputBucket, R1_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, R1_EVENTS_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, R1_LABELS_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, R1_ORDERS_S3_PREFIX);
      } catch (error) {
        console.warn('Failed to clean up R1 fixture S3 prefixes:', error);
      }
    }, 120000);

    it('a FANNING blended dimension returns correct NON-NULL per-group SUM and COUNT_DISTINCT (blue,red=150/2, green=30/1)', async () => {
      const rows = await runBlend(fanningContext());

      expect(rows).toHaveLength(2);
      const fan = fanningRow(rows); // the rolled-up 'blue, red' bucket (k1)
      const green = greenRow(rows);

      // The rolled-up label bucket actually combines red + blue (proves it is the roll-up, not
      // a single raw value).
      expect(fan.labels__label).toContain('red');
      expect(fan.labels__label).toContain('blue');

      // C2: both metrics land on the rolled-up bucket (NULL pre-fix, because the sleeve
      // projected the raw label which never matched the outer 'blue, red').
      expect(Number(fan['orders__revenue | SUM'])).toBe(150);
      expect(Number(fan['orders__orderId | COUNTUNIQUE'])).toBe(2);
      expect(Number(green['orders__revenue | SUM'])).toBe(30);
      expect(Number(green['orders__orderId | COUNTUNIQUE'])).toBe(1);
    }, 120000);

    it('a post-join filter on a NON-dimension column (country=US) is applied INSIDE the sleeve — metrics over the FILTERED set (blue,red=100/1, not 150/2)', async () => {
      const rows = await runBlend(
        fanningContext([
          { column: 'country', operator: 'eq', value: 'US', placement: 'post-join' },
        ] as never)
      );

      expect(rows).toHaveLength(2);
      const fan = fanningRow(rows);
      const green = greenRow(rows);

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
// Blended SUM through a NON-identity pre-join aggregate — value sleeve carries the
// dedup CTE's ALREADY-aggregated column (/C3, "funnel" shape, real
// Athena). Mirrors bigquery.integration.ts's equivalent case exactly (same topology,
// seed, ground truth) against the Trino/Presto dialect. Proves the R2 fix: a blended
// field whose OWN pre-join `aggregateFunction` is a real aggregate (here COUNT_DISTINCT,
// not the raw ANY_VALUE passthrough every other fixture uses) must have its
// post-join value sleeve read the OWNER's OWN dedup CTE column (one value per pre-join
// GROUP KEY), not the raw column keyed by the per-raw-row surrogate. Pre-R2 this would
// have summed RAW hit ids — on this STRING id shape that is a hard type error on
// dialects that reject SUM(STRING); on a numeric id it would silently sum the wrong
// (raw, pre-dedup) numbers.
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

const FUNNEL_RUN_SUFFIX = `funnel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const FUNNEL_SESSIONS_SUFFIX = `funnel_sessions_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const FUNNEL_HITS_SUFFIX = `funnel_hits_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const FUNNEL_S3_PREFIX = `integration-test/${FUNNEL_RUN_SUFFIX}/`;
const FUNNEL_SESSIONS_S3_PREFIX = `integration-test/${FUNNEL_SESSIONS_SUFFIX}/`;
const FUNNEL_HITS_S3_PREFIX = `integration-test/${FUNNEL_HITS_SUFFIX}/`;

describeIfCredentials(
  'Blended SUM through a non-identity pre-join aggregate — value sleeve (/C3, funnel, real Athena)',
  () => {
    let adapter: AthenaApiAdapter;
    let s3Adapter: S3ApiAdapter;
    let credentials: AthenaCredentials;
    let config: AthenaConfig;
    let database: string;

    const builder = new AthenaBlendedQueryBuilder(new AthenaClauseRenderer());

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
        mainTableReference: `"${database}"."${FUNNEL_SESSIONS_SUFFIX}"`,
        mainDataMartTitle: 'Sessions',
        mainDataMartUrl: 'http://x/sessions',
        chains: [
          {
            relationship: funnelRelationship('rel-hits', 'hits', [
              { sourceFieldName: 'session_id', targetFieldName: 'session_id' },
            ]),
            targetTableReference: `"${database}"."${FUNNEL_HITS_SUFFIX}"`,
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

    async function runBlend(
      context: BlendedQueryContext
    ): Promise<Record<string, string | undefined>[]> {
      const { sql, params } = builder.buildBlendedQuery(context);
      const { queryExecutionId } = await adapter.executeQuery(
        sql,
        config.outputBucket,
        `${FUNNEL_S3_PREFIX}funnel/`,
        params
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const results = await adapter.getQueryResults(queryExecutionId, undefined, 1000);
      const rows = results.ResultSet?.Rows ?? [];
      const columnInfo = results.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      return rows.slice(1).map(r => {
        const obj: Record<string, string | undefined> = {};
        columnInfo.forEach((col, i) => {
          obj[col.Name!] = r.Data?.[i]?.VarCharValue;
        });
        return obj;
      });
    }

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

      // Pre-cleanup in case of a previous crash
      for (const suffix of [FUNNEL_SESSIONS_SUFFIX, FUNNEL_HITS_SUFFIX]) {
        try {
          const { queryExecutionId: dropId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${FUNNEL_S3_PREFIX}cleanup/`
          );
          await adapter.waitForQueryToComplete(dropId);
        } catch {
          // ignore
        }
      }

      const sessionsCtas = `CREATE TABLE "${database}"."${FUNNEL_SESSIONS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${FUNNEL_SESSIONS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('s1','A'), ('s2','A'), ('s3','B')
) AS t (session_id, campaign)`;

      const hitsCtas = `CREATE TABLE "${database}"."${FUNNEL_HITS_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${FUNNEL_HITS_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  ('s1','h1'), ('s1','h1'), ('s1','h2'),
  ('s2','h3'), ('s2','h4'), ('s2','h5'),
  ('s3','h6'), ('s3','h6')
) AS t (session_id, hit_id)`;

      const { queryExecutionId: sessionsId } = await adapter.executeQuery(
        sessionsCtas,
        config.outputBucket,
        `${FUNNEL_S3_PREFIX}funnel-sessions-ctas/`
      );
      await adapter.waitForQueryToComplete(sessionsId);

      const { queryExecutionId: hitsId } = await adapter.executeQuery(
        hitsCtas,
        config.outputBucket,
        `${FUNNEL_S3_PREFIX}funnel-hits-ctas/`
      );
      await adapter.waitForQueryToComplete(hitsId);
    }, 180000);

    afterAll(async () => {
      for (const suffix of [FUNNEL_SESSIONS_SUFFIX, FUNNEL_HITS_SUFFIX]) {
        try {
          const { queryExecutionId } = await adapter.executeQuery(
            `DROP TABLE IF EXISTS \`${database}\`.\`${suffix}\``,
            config.outputBucket,
            `${FUNNEL_S3_PREFIX}funnel-drop/`
          );
          await adapter.waitForQueryToComplete(queryExecutionId);
        } catch (error) {
          console.warn(`Failed to drop funnel table ${suffix}:`, error);
        }
      }
      try {
        await s3Adapter.cleanupOutputFiles(config.outputBucket, FUNNEL_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, FUNNEL_SESSIONS_S3_PREFIX);
        await s3Adapter.cleanupOutputFiles(config.outputBucket, FUNNEL_HITS_S3_PREFIX);
      } catch (error) {
        console.warn('Failed to clean up funnel S3 prefixes:', error);
      }
    }, 120000);

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
      const byCampaign = new Map(rows.map(r => [r.campaign, Number(r['hits__hit_id | SUM'])]));

      expect(byCampaign.get('A')).toBe(5);
      expect(byCampaign.get('B')).toBe(1);
    }, 120000);
  }
);
