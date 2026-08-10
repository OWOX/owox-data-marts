import {
  AthenaFieldType,
  parseAthenaFieldType,
} from '../data-storage-types/athena/enums/athena-field-type.enum';
import {
  BigQueryFieldType,
  parseBigQueryFieldType,
} from '../data-storage-types/bigquery/enums/bigquery-field-type.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import {
  parseRedshiftFieldType,
  RedshiftFieldType,
} from '../data-storage-types/redshift/enums/redshift-field-type.enum';

export function isDataQualityFreshnessTypeSupported(
  storageType: DataStorageType,
  nativeType: string
): boolean {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return parseBigQueryFieldType(nativeType) === BigQueryFieldType.TIMESTAMP;
    case DataStorageType.AWS_ATHENA:
      return parseAthenaFieldType(nativeType) === AthenaFieldType.TIMESTAMP_WITH_TIME_ZONE;
    case DataStorageType.AWS_REDSHIFT:
      return parseRedshiftFieldType(nativeType) === RedshiftFieldType.TIMESTAMPTZ;
    case DataStorageType.DATABRICKS:
      return nativeType.trim().toUpperCase() === 'TIMESTAMP';
    case DataStorageType.SNOWFLAKE:
      return false;
  }
}
