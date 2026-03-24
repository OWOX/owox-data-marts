import { AthenaApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/athena-api.adapter';
import { AthenaCredentials } from 'src/data-marts/data-storage-types/athena/schemas/athena-credentials.schema';
import { AthenaConfig } from 'src/data-marts/data-storage-types/athena/schemas/athena-config.schema';
import { S3ApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/s3-api.adapter';
import { AthenaApiAdapterFactory } from 'src/data-marts/data-storage-types/athena/adapters/athena-api-adapter.factory';
import { S3ApiAdapterFactory } from 'src/data-marts/data-storage-types/athena/adapters/s3-api-adapter.factory';
import { AthenaDataMartSchemaProvider } from 'src/data-marts/data-storage-types/athena/services/athena-data-mart-schema.provider';
import { AthenaQueryBuilder } from 'src/data-marts/data-storage-types/athena/services/athena-query.builder';
import { DataStorageCredentialsResolver } from 'src/data-marts/data-storage-types/data-storage-credentials-resolver.service';
import { TableDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/table-definition.schema';

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
  // eslint-disable-next-line no-console
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
        'integration-test/cleanup/'
      );
      await adapter.waitForQueryToComplete(dropId);
    } catch {
      // Ignore errors during pre-cleanup
    }

    // Create test table via CTAS
    const ctasQuery = `CREATE TABLE "${database}"."${TEST_TABLE_SUFFIX}"
WITH (format = 'PARQUET', external_location = 's3://${config.outputBucket}/${TEST_S3_PREFIX}data/')
AS SELECT
  1 AS id,
  'test_name' AS name,
  true AS active,
  TIMESTAMP '2024-01-01 00:00:00.000' AS created_at`;

    const { queryExecutionId } = await adapter.executeQuery(
      ctasQuery,
      config.outputBucket,
      'integration-test/ctas/'
    );
    await adapter.waitForQueryToComplete(queryExecutionId);
  }, 120000);

  afterAll(async () => {
    try {
      // Drop test table
      const { queryExecutionId } = await adapter.executeQuery(
        `DROP TABLE IF EXISTS \`${database}\`.\`${TEST_TABLE_SUFFIX}\``,
        config.outputBucket,
        'integration-test/drop/'
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to drop test table during teardown:', error);
    }

    try {
      // Clean up S3 data at CTAS external location
      await s3Adapter.cleanupOutputFiles(config.outputBucket, `${TEST_S3_PREFIX}data/`);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to clean up S3 test data:', error);
    }

    try {
      // Clean up all S3 output files under integration-test/ prefix
      // (covers ctas, cleanup, drop, dry-run, schema query outputs)
      await s3Adapter.cleanupOutputFiles(config.outputBucket, 'integration-test/');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to clean up S3 output files:', error);
    }
  }, 60000);

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
      const queryBuilder = new AthenaQueryBuilder();
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
});
