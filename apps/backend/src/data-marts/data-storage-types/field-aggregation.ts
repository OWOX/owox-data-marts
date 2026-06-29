import { AthenaFieldType } from './athena/enums/athena-field-type.enum';
import { BigQueryFieldType } from './bigquery/enums/bigquery-field-type.enum';
import { DatabricksFieldType } from './databricks/enums/databricks-field-type.enum';
import { DataStorageType } from './enums/data-storage-type.enum';
import { RedshiftFieldType } from './redshift/enums/redshift-field-type.enum';
import { SnowflakeFieldType } from './snowflake/enums/snowflake-field-type.enum';
import { ReportAggregateFunction } from '../dto/schemas/aggregate-function.schema';
import { StorageFieldType } from '../dto/domain/storage-field-type';

export function computeEffectiveType(
  rawType: StorageFieldType,
  aggFunc: ReportAggregateFunction | undefined,
  storageType: DataStorageType
): StorageFieldType {
  if (!aggFunc) return rawType;
  switch (aggFunc) {
    case 'COUNT':
    case 'COUNT_DISTINCT':
      return integerTypeFor(storageType);
    case 'STRING_AGG':
      return getStringType(storageType);
    // The average of integers is fractional, so AVG widens to the storage's float type.
    case 'AVG':
      return getFloatType(storageType);
    case 'SUM':
    case 'MIN':
    case 'MAX':
    case 'ANY_VALUE':
      return rawType;
    case 'P25':
    case 'P50':
    case 'P75':
    case 'P95':
      return getFloatType(storageType);
    default: {
      const _exhaustive: never = aggFunc;
      return _exhaustive;
    }
  }
}

/**
 * Storage-specific integer type. Used for COUNT/COUNT_DISTINCT effective types and
 * for the synthetic Row Count header (COUNT(*)).
 */
export function integerTypeFor(storageType: DataStorageType): StorageFieldType {
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

function getFloatType(storageType: DataStorageType): StorageFieldType {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return BigQueryFieldType.FLOAT;
    case DataStorageType.AWS_ATHENA:
      return AthenaFieldType.DOUBLE;
    case DataStorageType.SNOWFLAKE:
      return SnowflakeFieldType.FLOAT;
    case DataStorageType.AWS_REDSHIFT:
      return RedshiftFieldType.DOUBLE_PRECISION;
    case DataStorageType.DATABRICKS:
      return DatabricksFieldType.DOUBLE;
    default: {
      // Compile-time exhaustiveness + runtime guard: a future storage type must fail loudly,
      // never silently return undefined.
      const _exhaustive: never = storageType;
      throw new Error(`getFloatType: unhandled storage type ${String(_exhaustive)}`);
    }
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
