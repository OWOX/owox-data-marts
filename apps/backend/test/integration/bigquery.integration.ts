import { BigQueryApiAdapter } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api.adapter';
import { BigQueryServiceAccountCredentialsSchema } from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import {
  BigQueryConfig,
  BIGQUERY_AUTODETECT_LOCATION,
} from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema';
import { BigQueryApiAdapterFactory } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api-adapter.factory';
import { BigQueryDataMartSchemaProvider } from 'src/data-marts/data-storage-types/bigquery/services/bigquery-data-mart-schema.provider';
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
  // eslint-disable-next-line no-console
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
      // eslint-disable-next-line no-console
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
      const queryBuilder = new BigQueryQueryBuilder();
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
});
