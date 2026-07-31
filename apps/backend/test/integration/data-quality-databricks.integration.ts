import { DatabricksApiAdapter } from 'src/data-marts/data-storage-types/databricks/adapters/databricks-api.adapter';
import { DatabricksAuthMethod } from 'src/data-marts/data-storage-types/databricks/enums/databricks-auth-method.enum';
import { DatabricksConfig } from 'src/data-marts/data-storage-types/databricks/schemas/databricks-config.schema';
import { DatabricksCredentials } from 'src/data-marts/data-storage-types/databricks/schemas/databricks-credentials.schema';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { registerRealDataQualitySuite } from './data-quality-real-suite';

const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_HTTP_PATH = process.env.DATABRICKS_HTTP_PATH;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_CATALOG = process.env.DATABRICKS_CATALOG;
const DATABRICKS_SCHEMA = process.env.DATABRICKS_SCHEMA;

const credentialsAvailable = Boolean(
  DATABRICKS_HOST &&
  DATABRICKS_HTTP_PATH &&
  DATABRICKS_TOKEN &&
  DATABRICKS_CATALOG &&
  DATABRICKS_SCHEMA
);

if (!credentialsAvailable) {
  console.log('Skipping Databricks Data Quality integration tests: credentials are not configured');
}

const describeIfCredentials = credentialsAvailable ? describe : describe.skip;

describeIfCredentials('Databricks Data Quality checks', () => {
  let adapter: DatabricksApiAdapter;

  beforeAll(() => {
    const credentials: DatabricksCredentials = {
      authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
      token: DATABRICKS_TOKEN!,
    };
    const config: DatabricksConfig = {
      host: DATABRICKS_HOST!,
      httpPath: DATABRICKS_HTTP_PATH!,
    };
    adapter = new DatabricksApiAdapter(credentials, config);
  });

  afterAll(async () => {
    await adapter.destroy();
  }, 60000);

  registerRealDataQualitySuite({
    storageType: DataStorageType.DATABRICKS,
    schemaType: 'databricks-data-mart-schema',
    nativeTypes: {
      integer: 'BIGINT',
      string: 'STRING',
      timestamp: 'TIMESTAMP',
    },
    expressions: {
      integer: value => `CAST(${value ?? 'NULL'} AS BIGINT)`,
      string: value =>
        value === null
          ? 'CAST(NULL AS STRING)'
          : `CAST('${value.replaceAll("'", "''")}' AS STRING)`,
      currentTimestamp: 'current_timestamp()',
      staleTimestamp: 'current_timestamp() - INTERVAL 48 HOURS',
    },
    timeout: 120000,
    execute: async sql => ({
      sql,
      rows: await adapter.executeQueryAndFetchAll(sql),
    }),
  });
});
