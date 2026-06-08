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
    //   6  (empty)  x       0  true   200 days ago (last year)
    //   7  future   f      70  true   ~13 months from now (next calendar year)
    //
    // DATE_SUB expressions ensure relative_date assertions hold whenever the suite runs.
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
        (6, '',         'x',     0,  true,  DATE_SUB(CURRENT_DATE(), INTERVAL 200 DAY),    TIMESTAMP(DATE_SUB(CURRENT_DATE(), INTERVAL 200 DAY))),
        (7, 'future',   'f',    70,  true,  DATE_ADD(CURRENT_DATE(), INTERVAL 13 MONTH),   TIMESTAMP(DATE_ADD(CURRENT_DATE(), INTERVAL 13 MONTH)))`
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

  it('neq: score != 20 → rows 1,3,4,5,6,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'neq', value: 20 }],
    });
    expect(ids(rows)).toEqual([1, 3, 4, 5, 6, 7]);
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

  it('not_contains: name not contains "alpha" → rows 2,3,5,6,7 (case-sensitive; ALPHA excluded; future row 7)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_contains', value: 'alpha' }],
    });
    expect(ids(rows)).toEqual([2, 3, 5, 6, 7]);
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

  it('not_regex: name not matching "^alpha" → rows 2,3,5,6,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_regex', value: '^alpha' }],
    });
    expect(ids(rows)).toEqual([2, 3, 5, 6, 7]);
  }, 60000);

  // --- No-value operators ---

  it('is_empty on name → row 6 (empty string)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_empty' }],
    });
    expect(ids(rows)).toEqual([6]);
  }, 60000);

  it('is_not_empty on name → rows 1,2,3,4,5,7', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_not_empty' }],
    });
    expect(ids(rows)).toEqual([1, 2, 3, 4, 5, 7]);
  }, 60000);

  it('is_null on name → 0 rows (no NULLs in seed)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_null' }],
    });
    expect(rows).toHaveLength(0);
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
  //   1 → today        5 → today
  //   4 → -5 days      2 → -40 days
  //   6 → -200 days    3 → -400 days
  //
  // today    → rows dated CURRENT_DATE() → [1, 5]
  // last_n_days(7) → >= CURRENT_DATE - 7 days → [1, 4, 5]
  // this_year → >= DATE_TRUNC(CURRENT_DATE, YEAR) → [1, 2, 4, 5]
  // last_n_months(3) → -40 days (~1.3 months) included → [1, 2, 4, 5]

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

  it('relative_date last_n_days(7) on created_at → rows 1,4,5,7 (no upper bound; future row 7 satisfies >= today-7)', async () => {
    const rows = await runMatrix({
      filters: [
        { column: 'created_at', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
      ],
    });
    expect(ids(rows)).toEqual([1, 4, 5, 7]);
  }, 60000);

  it('relative_date this_year on created_at → rows 1,2,4,5 (excludes future row 7)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_at', operator: 'relative_date', value: { kind: 'this_year' } }],
    });
    // Row 7 is ~13 months in the future (next calendar year) and must NOT appear.
    expect(ids(rows)).not.toContain(7);
    expect(ids(rows)).toEqual([1, 2, 4, 5]);
  }, 60000);

  it('relative_date last_n_months(3) on created_at → rows 1,2,4,5,7 (no upper bound; future row 7 satisfies >= today-3m)', async () => {
    const rows = await runMatrix({
      filters: [
        {
          column: 'created_at',
          operator: 'relative_date',
          value: { kind: 'last_n_months', n: 3 },
        },
      ],
    });
    expect(ids(rows)).toEqual([1, 2, 4, 5, 7]);
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
              column: 'role',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
              aliasPath: 'users',
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
              column: 'role',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
              aliasPath: 'users',
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
              column: 'role',
              operator: 'eq',
              value: 'viewer',
              placement: 'pre-join',
              aliasPath: 'users',
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
