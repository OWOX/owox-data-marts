import { AthenaFieldType } from './athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from './bigquery/enums/bigquery-field-type.enum';
import { DatabricksFieldType } from './databricks/enums/databricks-field-type.enum';
import { DataStorageType } from './enums/data-storage-type.enum';
import { RedshiftFieldType } from './redshift/enums/redshift-field-type.enum';
import { SnowflakeFieldType } from './snowflake/enums/snowflake-field-type.enum';
import { AggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { StorageFieldType } from '../dto/domain/storage-field-type';

export function computeEffectiveType(
  rawType: StorageFieldType,
  aggFunc: AggregateFunction | undefined,
  storageType: DataStorageType
): StorageFieldType {
  if (!aggFunc) return rawType;
  switch (aggFunc) {
    case 'COUNT':
    case 'COUNT_DISTINCT':
      return getIntegerType(storageType);
    case 'STRING_AGG':
      return getStringType(storageType);
    case 'SUM':
    case 'MIN':
    case 'MAX':
    case 'ANY_VALUE':
      return rawType;
    default: {
      const _exhaustive: never = aggFunc;
      return _exhaustive;
    }
  }
}

function getIntegerType(storageType: DataStorageType): StorageFieldType {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return BigQueryFieldType.INTEGER;
    case DataStorageType.AWS_ATHENA:
      return AthenaFieldType.INTEGER;
    case DataStorageType.SNOWFLAKE:
      return SnowflakeFieldType.INTEGER;
    case DataStorageType.AWS_REDSHIFT:
      return RedshiftFieldType.INTEGER;
    case DataStorageType.DATABRICKS:
      return DatabricksFieldType.INT;
  }
}

function getStringType(storageType: DataStorageType): StorageFieldType {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return BigQueryFieldType.STRING;
    case DataStorageType.AWS_ATHENA:
      return AthenaFieldType.STRING;
    case DataStorageType.SNOWFLAKE:
      return SnowflakeFieldType.STRING;
    case DataStorageType.AWS_REDSHIFT:
      return RedshiftFieldType.VARCHAR;
    case DataStorageType.DATABRICKS:
      return DatabricksFieldType.STRING;
  }
}
