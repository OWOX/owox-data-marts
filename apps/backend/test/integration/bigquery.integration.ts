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
  }, 60000);

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
});
