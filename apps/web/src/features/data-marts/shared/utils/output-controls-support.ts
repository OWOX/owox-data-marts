import { DataStorageType } from '../../../data-storage/shared/model/types/data-storage-type.enum';

const SUPPORTED: ReadonlySet<DataStorageType> = new Set([DataStorageType.GOOGLE_BIGQUERY]);

export function supportsOutputControls(type: DataStorageType): boolean {
  return SUPPORTED.has(type);
}
