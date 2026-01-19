import { BigQueryReaderState } from '../bigquery/interfaces/bigquery-reader-state.interface';
import { AthenaReaderState } from '../athena/interfaces/athena-reader-state.interface';
import { SnowflakeReaderState } from '../snowflake/interfaces/snowflake-reader-state.interface';
import { RedshiftReaderState } from '../redshift/interfaces/redshift-reader-state.interface';
import { DatabricksReaderState } from '../databricks/interfaces/databricks-reader-state.interface';

/**
 * Union type for all supported reader states
 */
export type DataStorageReportReaderState =
  | BigQueryReaderState
  | AthenaReaderState
  | SnowflakeReaderState
  | RedshiftReaderState
  | DatabricksReaderState;
