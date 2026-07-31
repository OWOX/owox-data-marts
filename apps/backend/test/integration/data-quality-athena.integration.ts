import { AthenaApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/athena-api.adapter';
import { S3ApiAdapter } from 'src/data-marts/data-storage-types/athena/adapters/s3-api.adapter';
import { AthenaConfig } from 'src/data-marts/data-storage-types/athena/schemas/athena-config.schema';
import { AthenaCredentials } from 'src/data-marts/data-storage-types/athena/schemas/athena-credentials.schema';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { registerRealDataQualitySuite } from './data-quality-real-suite';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const ATHENA_REGION = process.env.ATHENA_REGION;
const ATHENA_OUTPUT_BUCKET = process.env.ATHENA_OUTPUT_BUCKET;
const ATHENA_DATABASE = process.env.ATHENA_DATABASE;

const credentialsAvailable = Boolean(
  AWS_ACCESS_KEY_ID &&
  AWS_SECRET_ACCESS_KEY &&
  ATHENA_REGION &&
  ATHENA_OUTPUT_BUCKET &&
  ATHENA_DATABASE
);

if (!credentialsAvailable) {
  console.log('Skipping Athena Data Quality integration tests: credentials are not configured');
}

const describeIfCredentials = credentialsAvailable ? describe : describe.skip;
const outputPrefix = `integration-test/data-quality-athena-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 8)}/`;

describeIfCredentials('Athena Data Quality checks', () => {
  let adapter: AthenaApiAdapter;
  let s3Adapter: S3ApiAdapter;
  let config: AthenaConfig;

  beforeAll(() => {
    const credentials: AthenaCredentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };
    config = {
      region: ATHENA_REGION!,
      outputBucket: ATHENA_OUTPUT_BUCKET!,
    };
    adapter = new AthenaApiAdapter(credentials, config);
    s3Adapter = new S3ApiAdapter(credentials, config);
  });

  afterAll(async () => {
    try {
      await s3Adapter.cleanupOutputFiles(config.outputBucket, outputPrefix);
    } catch (error) {
      console.warn('Failed to clean up Athena Data Quality query results:', error);
    }
  }, 90000);

  registerRealDataQualitySuite({
    storageType: DataStorageType.AWS_ATHENA,
    schemaType: 'athena-data-mart-schema',
    nativeTypes: {
      integer: 'BIGINT',
      string: 'VARCHAR',
      timestamp: 'TIMESTAMP WITH TIME ZONE',
    },
    expressions: {
      integer: value => `CAST(${value ?? 'NULL'} AS BIGINT)`,
      string: value =>
        value === null
          ? 'CAST(NULL AS VARCHAR)'
          : `CAST('${value.replaceAll("'", "''")}' AS VARCHAR)`,
      currentTimestamp: 'current_timestamp',
      staleTimestamp: "current_timestamp - INTERVAL '48' HOUR",
    },
    timeout: 180000,
    execute: async sql => {
      const { queryExecutionId } = await adapter.executeQuery(
        sql,
        config.outputBucket,
        outputPrefix
      );
      await adapter.waitForQueryToComplete(queryExecutionId);
      const result = await adapter.getQueryResults(queryExecutionId, undefined, 100);
      const columns = result.ResultSet?.ResultSetMetadata?.ColumnInfo ?? [];
      const rows = (result.ResultSet?.Rows ?? [])
        .slice(1)
        .map(row =>
          Object.fromEntries(
            columns.map((column, index) => [
              column.Name ?? `column_${index}`,
              row.Data?.[index]?.VarCharValue ?? null,
            ])
          )
        );
      return {
        sql,
        rows,
        columnMetadata: columns.map(column => ({
          name: column.Name,
          label: column.Label,
          typeName: column.Type,
        })),
      };
    },
  });
});
