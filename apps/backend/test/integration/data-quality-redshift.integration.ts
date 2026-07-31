import { Field } from '@aws-sdk/client-redshift-data';
import { RedshiftApiAdapter } from 'src/data-marts/data-storage-types/redshift/adapters/redshift-api.adapter';
import { RedshiftConnectionType } from 'src/data-marts/data-storage-types/redshift/enums/redshift-connection-type.enum';
import { RedshiftConfig } from 'src/data-marts/data-storage-types/redshift/schemas/redshift-config.schema';
import { RedshiftCredentials } from 'src/data-marts/data-storage-types/redshift/schemas/redshift-credentials.schema';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { registerRealDataQualitySuite } from './data-quality-real-suite';

const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const REDSHIFT_REGION = process.env.REDSHIFT_REGION;
const REDSHIFT_WORKGROUP_NAME = process.env.REDSHIFT_WORKGROUP_NAME;
const REDSHIFT_DATABASE = process.env.REDSHIFT_DATABASE;

const credentialsAvailable = Boolean(
  AWS_ACCESS_KEY_ID &&
  AWS_SECRET_ACCESS_KEY &&
  REDSHIFT_REGION &&
  REDSHIFT_WORKGROUP_NAME &&
  REDSHIFT_DATABASE
);

if (!credentialsAvailable) {
  console.log('Skipping Redshift Data Quality integration tests: credentials are not configured');
}

const describeIfCredentials = credentialsAvailable ? describe : describe.skip;

describeIfCredentials('Redshift Data Quality checks', () => {
  let adapter: RedshiftApiAdapter;

  beforeAll(() => {
    const credentials: RedshiftCredentials = {
      accessKeyId: AWS_ACCESS_KEY_ID!,
      secretAccessKey: AWS_SECRET_ACCESS_KEY!,
    };
    const config: RedshiftConfig = {
      connectionType: RedshiftConnectionType.SERVERLESS,
      region: REDSHIFT_REGION!,
      database: REDSHIFT_DATABASE!,
      workgroupName: REDSHIFT_WORKGROUP_NAME!,
    };
    adapter = new RedshiftApiAdapter(credentials, config);
  });

  jest.retryTimes(1, { logErrorsBeforeRetry: true });

  registerRealDataQualitySuite({
    storageType: DataStorageType.AWS_REDSHIFT,
    schemaType: 'redshift-data-mart-schema',
    nativeTypes: {
      integer: 'BIGINT',
      string: 'VARCHAR',
      timestamp: 'TIMESTAMPTZ',
    },
    expressions: {
      integer: value => `CAST(${value ?? 'NULL'} AS BIGINT)`,
      string: value =>
        value === null
          ? 'CAST(NULL AS VARCHAR)'
          : `CAST('${value.replaceAll("'", "''")}' AS VARCHAR)`,
      currentTimestamp: 'CAST(GETDATE() AS TIMESTAMPTZ)',
      staleTimestamp: 'CAST(DATEADD(hour, -48, GETDATE()) AS TIMESTAMPTZ)',
    },
    timeout: 120000,
    execute: async sql => {
      const { statementId } = await adapter.executeQuery(sql);
      await adapter.waitForQueryToComplete(statementId);
      const metadata = await adapter.getQueryResultsMetadata(statementId);
      const columnNames = metadata.map(
        (column, index) => column.label ?? column.name ?? `column_${index}`
      );
      const rows: Record<string, unknown>[] = [];
      let nextToken: string | undefined;
      do {
        const result = await adapter.getQueryResults(statementId, nextToken);
        for (const record of result.Records ?? []) {
          rows.push(
            Object.fromEntries(
              columnNames.map((column, index) => [column, redshiftValue(record[index])])
            )
          );
        }
        nextToken = result.NextToken;
      } while (nextToken);
      return {
        sql,
        rows,
        columnMetadata: metadata.map(column => ({
          name: column.name,
          label: column.label,
          typeName: column.typeName,
        })),
      };
    },
  });
});

function redshiftValue(field?: Field): unknown {
  if (!field || field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return field.longValue;
  if (field.doubleValue !== undefined) return field.doubleValue;
  if (field.booleanValue !== undefined) return field.booleanValue;
  if (field.blobValue !== undefined) return Buffer.from(field.blobValue).toString('utf8');
  return null;
}
