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
    //   6  (empty)  x       0  true   200 days ago (last year)
    //
    // Date expressions use date_add so the relative_date assertions hold
    // regardless of when the suite runs.
    const ctasQuery = `CREATE TABLE "${database}"."${MATRIX_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${MATRIX_S3_PREFIX}data/')
AS SELECT * FROM (VALUES
  (1, 'alpha',    'a',    10,  true,  current_date),
  (2, 'beta',     'b',    20,  false, date_add('day', -40, current_date)),
  (3, 'gamma',    'c',    30,  true,  date_add('day', -400, current_date)),
  (4, 'alphabet', 'a%b',  40,  true,  date_add('day', -5, current_date)),
  (5, 'ALPHA',    'a_b',  50,  false, current_date),
  (6, '',         'x',     0,  true,  date_add('day', -200, current_date))
) AS t (id, name, tag, score, active, created_at)`;

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

  it('neq: score != 20 → rows 1,3,4,5,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'neq', value: 20 }],
    });
    expect(ids(rows)).toEqual(['1', '3', '4', '5', '6']);
  }, 60000);

  it('gt: score > 30 → rows 4,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'gt', value: 30 }],
    });
    expect(ids(rows)).toEqual(['4', '5']);
  }, 60000);

  it('lt: score < 30 → rows 1,2,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'lt', value: 30 }],
    });
    expect(ids(rows)).toEqual(['1', '2', '6']);
  }, 60000);

  it('gte: score >= 30 → rows 3,4,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'gte', value: 30 }],
    });
    expect(ids(rows)).toEqual(['3', '4', '5']);
  }, 60000);

  it('lte: score <= 30 → rows 1,2,3,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'score', operator: 'lte', value: 30 }],
    });
    expect(ids(rows)).toEqual(['1', '2', '3', '6']);
  }, 60000);

  // --- Substring / affix operators on name ---

  it('not_contains: name not contains "alpha" → rows 2,3,5,6 (case-sensitive; ALPHA excluded)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_contains', value: 'alpha' }],
    });
    expect(ids(rows)).toEqual(['2', '3', '5', '6']);
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

  it('not_regex: name not matching "^alpha" → rows 2,3,5,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'not_regex', value: '^alpha' }],
    });
    expect(ids(rows)).toEqual(['2', '3', '5', '6']);
  }, 60000);

  // --- No-value operators ---

  it('is_empty on name → row 6 (empty string)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_empty' }],
    });
    expect(ids(rows)).toEqual(['6']);
  }, 60000);

  it('is_not_empty on name → rows 1,2,3,4,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_not_empty' }],
    });
    expect(ids(rows)).toEqual(['1', '2', '3', '4', '5']);
  }, 60000);

  it('is_null on name → 0 rows (no NULLs in seed)', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_null' }],
    });
    expect(rows).toHaveLength(0);
  }, 60000);

  it('is_not_null on name → all 6 rows', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'name', operator: 'is_not_null' }],
    });
    expect(ids(rows)).toEqual(['1', '2', '3', '4', '5', '6']);
  }, 60000);

  it('is_true on active → rows 1,3,4,6', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'active', operator: 'is_true' }],
    });
    expect(ids(rows)).toEqual(['1', '3', '4', '6']);
  }, 60000);

  it('is_false on active → rows 2,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'active', operator: 'is_false' }],
    });
    expect(ids(rows)).toEqual(['2', '5']);
  }, 60000);

  // --- relative_date on created_at (DATE column) ---
  // Row dates (relative to test run date):
  //   1 → today        5 → today
  //   4 → -5 days      2 → -40 days
  //   6 → -200 days    3 → -400 days
  //
  // today    → rows dated current_date → [1, 5]
  // last_n_days(7) → >= current_date - 7 days → [1, 4, 5]
  // this_year → >= date_trunc('year', current_date) → depends on how many days
  //             ago fall in the current calendar year.
  //             -5 days (row 4) and -40 days (row 2) are always in current year
  //             as long as the test runs after Feb 10 of any year.
  //             -200 days (row 6) and -400 days (row 3) are last year.
  //             → [1, 2, 4, 5]

  it('relative_date today on created_at → rows 1,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_at', operator: 'relative_date', value: { kind: 'today' } }],
    });
    expect(ids(rows)).toEqual(['1', '5']);
  }, 60000);

  it('relative_date last_n_days(7) on created_at → rows 1,4,5', async () => {
    const rows = await runMatrix({
      filters: [
        { column: 'created_at', operator: 'relative_date', value: { kind: 'last_n_days', n: 7 } },
      ],
    });
    expect(ids(rows)).toEqual(['1', '4', '5']);
  }, 60000);

  it('relative_date this_year on created_at → rows 1,2,4,5', async () => {
    const rows = await runMatrix({
      filters: [{ column: 'created_at', operator: 'relative_date', value: { kind: 'this_year' } }],
    });
    expect(ids(rows)).toEqual(['1', '2', '4', '5']);
  }, 60000);

  it('relative_date last_n_months(3) on created_at → rows 1,4,5 (row 2 at -40 days is within ~1.3 months)', async () => {
    // -40 days is within 3 months → row 2 included too
    const rows = await runMatrix({
      filters: [
        {
          column: 'created_at',
          operator: 'relative_date',
          value: { kind: 'last_n_months', n: 3 },
        },
      ],
    });
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
// A "slice" is a FilterRule with placement:'pre-join' + aliasPath, injected as a
// WHERE INSIDE the joined subsidiary mart's `<alias>_raw` CTE — BEFORE the JOIN.
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
              column: 'role',
              operator: 'eq',
              value: 'admin',
              placement: 'pre-join',
              aliasPath: 'users',
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
      expect(ids(rows)).toEqual(['2']);
      expect(rows[0]?.role).toBe('viewer');
    }, 120000);
  }
);
