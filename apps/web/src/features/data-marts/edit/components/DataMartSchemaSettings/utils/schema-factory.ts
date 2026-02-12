import { DataStorageType } from '../../../../../data-storage/shared/model/types/data-storage-type.enum';
import type { DataMartSchema } from '../../../../shared/types/data-mart-schema.types';

/**
 * Creates an initial schema object based on the storage type.
 * This factory function ensures that we don't directly mutate props
 * and provides a consistent way to create schema objects.
 */
export function createInitialSchema(storageType: DataStorageType): DataMartSchema {
  switch (storageType) {
    case DataStorageType.GOOGLE_BIGQUERY:
    case DataStorageType.LEGACY_GOOGLE_BIGQUERY:
      return { type: 'bigquery-data-mart-schema', fields: [] };
    case DataStorageType.AWS_ATHENA:
      return { type: 'athena-data-mart-schema', fields: [] };
    case DataStorageType.SNOWFLAKE:
      return { type: 'snowflake-data-mart-schema', fields: [] };
    case DataStorageType.AWS_REDSHIFT:
      return { type: 'redshift-data-mart-schema', fields: [] };
    case DataStorageType.DATABRICKS:
      return { type: 'databricks-data-mart-schema', fields: [] };
    default:
      throw new Error(`Unsupported storage type: ${storageType}`);
  }
}
