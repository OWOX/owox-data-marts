import { SnowflakeApiAdapter } from 'src/data-marts/data-storage-types/snowflake/adapters/snowflake-api.adapter';
import { SnowflakeAuthMethod } from 'src/data-marts/data-storage-types/snowflake/enums/snowflake-auth-method.enum';
import { SnowflakeConfig } from 'src/data-marts/data-storage-types/snowflake/schemas/snowflake-config.schema';
import { SnowflakeCredentials } from 'src/data-marts/data-storage-types/snowflake/schemas/snowflake-credentials.schema';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { registerRealDataQualitySuite } from './data-quality-real-suite';

const SNOWFLAKE_ACCOUNT = process.env.SNOWFLAKE_ACCOUNT;
const SNOWFLAKE_WAREHOUSE = process.env.SNOWFLAKE_WAREHOUSE;
const SNOWFLAKE_USERNAME = process.env.SNOWFLAKE_USERNAME;
const SNOWFLAKE_PASSWORD = process.env.SNOWFLAKE_PASSWORD;
const SNOWFLAKE_DATABASE = process.env.SNOWFLAKE_DATABASE;
const SNOWFLAKE_SCHEMA = process.env.SNOWFLAKE_SCHEMA;

const credentialsAvailable = Boolean(
  SNOWFLAKE_ACCOUNT &&
  SNOWFLAKE_WAREHOUSE &&
  SNOWFLAKE_USERNAME &&
  SNOWFLAKE_PASSWORD &&
  SNOWFLAKE_DATABASE &&
  SNOWFLAKE_SCHEMA
);

if (!credentialsAvailable) {
  console.log('Skipping Snowflake Data Quality integration tests: credentials are not configured');
}

const describeIfCredentials = credentialsAvailable ? describe : describe.skip;

describeIfCredentials('Snowflake Data Quality checks', () => {
  let adapter: SnowflakeApiAdapter;

  beforeAll(async () => {
    const credentials: SnowflakeCredentials = {
      authMethod: SnowflakeAuthMethod.PASSWORD,
      username: SNOWFLAKE_USERNAME!,
      password: SNOWFLAKE_PASSWORD!,
    };
    const config: SnowflakeConfig = {
      account: SNOWFLAKE_ACCOUNT!,
      warehouse: SNOWFLAKE_WAREHOUSE!,
    };
    adapter = new SnowflakeApiAdapter(credentials, config);
    await adapter.checkAccess();
  }, 120000);

  afterAll(async () => {
    await adapter.destroy();
  }, 60000);

  registerRealDataQualitySuite({
    storageType: DataStorageType.SNOWFLAKE,
    schemaType: 'snowflake-data-mart-schema',
    nativeTypes: {
      integer: 'NUMBER(38,0)',
      string: 'VARCHAR',
    },
    expressions: {
      integer: value => `CAST(${value ?? 'NULL'} AS NUMBER(38,0))`,
      string: value =>
        value === null
          ? 'CAST(NULL AS VARCHAR)'
          : `CAST('${value.replaceAll("'", "''")}' AS VARCHAR)`,
    },
    sourceIdentifier: identifier => `"${identifier.replaceAll('"', '""')}"`,
    timeout: 120000,
    execute: async sql => ({
      sql,
      rows: await adapter.executeQueryAndFetchAll(sql),
    }),
  });
});
