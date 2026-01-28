import { BigQueryCredentials } from './bigquery/schemas/bigquery-credentials.schema';
import { AthenaCredentials } from './athena/schemas/athena-credentials.schema';
import { SnowflakeCredentials } from './snowflake/schemas/snowflake-credentials.schema';
import { RedshiftCredentials } from './redshift/schemas/redshift-credentials.schema';
import { DatabricksCredentials } from './databricks/schemas/databricks-credentials.schema';

export type DataStorageCredentials =
  | BigQueryCredentials
  | AthenaCredentials
  | SnowflakeCredentials
  | RedshiftCredentials
  | DatabricksCredentials;
