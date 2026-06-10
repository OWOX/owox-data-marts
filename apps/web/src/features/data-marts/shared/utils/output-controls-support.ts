import { DataStorageType } from '../../../data-storage/shared/model/types/data-storage-type.enum';

// Mirror of backend OutputControlsCapabilityService — keep in sync.
const SUPPORTED: ReadonlySet<DataStorageType> = new Set([
  DataStorageType.GOOGLE_BIGQUERY,
  DataStorageType.LEGACY_GOOGLE_BIGQUERY,
  DataStorageType.AWS_ATHENA,
  DataStorageType.AWS_REDSHIFT,
  DataStorageType.SNOWFLAKE,
]);

export function supportsOutputControls(type: DataStorageType): boolean {
  return SUPPORTED.has(type);
}
