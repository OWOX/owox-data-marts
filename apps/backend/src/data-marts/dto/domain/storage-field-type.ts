import { AthenaFieldType } from '../../data-storage-types/athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from '../../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DatabricksFieldType } from '../../data-storage-types/databricks/enums/databricks-field-type.enum';
import { RedshiftFieldType } from '../../data-storage-types/redshift/enums/redshift-field-type.enum';
import { SnowflakeFieldType } from '../../data-storage-types/snowflake/enums/snowflake-field-type.enum';

export type StorageFieldType =
  | BigQueryFieldType
  | AthenaFieldType
  | SnowflakeFieldType
  | RedshiftFieldType
  | DatabricksFieldType;
