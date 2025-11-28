import { BigQueryCredentials } from './bigquery/schemas/bigquery-credentials.schema';
import { AthenaCredentials } from './athena/schemas/athena-credentials.schema';
import { SnowflakeCredentials } from './snowflake/schemas/snowflake-credentials.schema';

export type DataStorageCredentials = BigQueryCredentials | AthenaCredentials | SnowflakeCredentials;
