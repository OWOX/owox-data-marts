import { BigQueryApiAdapter } from 'src/data-marts/data-storage-types/bigquery/adapters/bigquery-api.adapter';
import { BigQueryServiceAccountCredentialsSchema } from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import {
  BIGQUERY_AUTODETECT_LOCATION,
  BigQueryConfig,
} from 'src/data-marts/data-storage-types/bigquery/schemas/bigquery-config.schema';
import { DataStorageType } from 'src/data-marts/data-storage-types/enums/data-storage-type.enum';
import { registerRealDataQualitySuite } from './data-quality-real-suite';

const BQ_SERVICE_ACCOUNT_KEY = process.env.BQ_SERVICE_ACCOUNT_KEY;
const BQ_PROJECT_ID = process.env.BQ_PROJECT_ID;
const BQ_DATASET = process.env.BQ_DATASET;

const credentialsAvailable = Boolean(BQ_SERVICE_ACCOUNT_KEY && BQ_PROJECT_ID && BQ_DATASET);

export function registerBigQueryDataQualityIntegrationSuite(
  storageType: DataStorageType.GOOGLE_BIGQUERY | DataStorageType.LEGACY_GOOGLE_BIGQUERY,
  suiteName: string
): void {
  if (!credentialsAvailable) {
    console.log(
      `Skipping ${suiteName} Data Quality integration tests: BigQuery credentials are not configured`
    );
  }

  const describeIfCredentials = credentialsAvailable ? describe : describe.skip;
  describeIfCredentials(`${suiteName} Data Quality checks`, () => {
    let adapter: BigQueryApiAdapter;

    beforeAll(() => {
      const credentials = BigQueryServiceAccountCredentialsSchema.parse(
        JSON.parse(BQ_SERVICE_ACCOUNT_KEY!)
      );
      const config: BigQueryConfig = {
        projectId: BQ_PROJECT_ID!,
        location: BIGQUERY_AUTODETECT_LOCATION,
      };
      adapter = new BigQueryApiAdapter(credentials, config);
    });

    registerRealDataQualitySuite({
      storageType,
      schemaType: 'bigquery-data-mart-schema',
      nativeTypes: {
        integer: 'INT64',
        string: 'STRING',
        timestamp: 'TIMESTAMP',
      },
      expressions: {
        integer: value => `CAST(${value ?? 'NULL'} AS INT64)`,
        string: value =>
          value === null
            ? 'CAST(NULL AS STRING)'
            : `CAST('${value.replaceAll("'", "''")}' AS STRING)`,
        currentTimestamp: 'CURRENT_TIMESTAMP()',
        staleTimestamp: 'TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 48 HOUR)',
      },
      fieldMode: 'NULLABLE',
      execute: async sql => {
        const { jobId } = await adapter.executeQuery(sql);
        const job = await adapter.getJob(jobId);
        const destination = job.metadata.configuration.query.destinationTable;
        if (!destination) throw new Error('BigQuery did not create a destination table');
        const table = adapter.createTableReference(
          destination.projectId,
          destination.datasetId,
          destination.tableId
        );
        const [rows] = await table.getRows({ maxResults: 100, autoPaginate: true });
        return { sql, rows: rows as Record<string, unknown>[] };
      },
    });
  });
}
