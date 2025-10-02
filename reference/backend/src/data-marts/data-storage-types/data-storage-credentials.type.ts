import { BigQueryCredentials } from './bigquery/schemas/bigquery-credentials.schema';
import { AthenaCredentials } from './athena/schemas/athena-credentials.schema';

export type DataStorageCredentials = BigQueryCredentials | AthenaCredentials;
