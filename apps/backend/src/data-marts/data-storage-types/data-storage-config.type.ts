import { BigQueryConfig } from './bigquery/schemas/bigquery-config.schema';
import { AthenaConfig } from './athena/schemas/athena-config.schema';
import { SnowflakeConfig } from './snowflake/schemas/snowflake-config.schema';
import { RedshiftConfig } from './redshift/schemas/redshift-config.schema';
import { DatabricksConfig } from './databricks/schemas/databricks-config.schema';

export type DataStorageConfig =
  | BigQueryConfig
  | AthenaConfig
  | SnowflakeConfig
  | RedshiftConfig
  | DatabricksConfig;
