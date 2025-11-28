import { DataStorageType } from '../model/types/data-storage-type.enum';
import type { DataStorage } from '../model/types/data-storage';

/**
 * Validates the configuration of the provided data storage.
 *
 * @param {DataStorage} storage - The data storage configuration to validate. The storage object should contain a type and a corresponding config object.
 * @return {boolean} Returns true if the storage configuration is valid based on its type, otherwise returns false.
 */
export function isDataStorageConfigValid(storage: DataStorage): boolean {
  switch (storage.type) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return Boolean(storage.config.projectId && storage.config.location);
    case DataStorageType.AWS_ATHENA:
      return Boolean(storage.config.region && storage.config.outputBucket);
    case DataStorageType.SNOWFLAKE:
      return Boolean(storage.config.account && storage.config.warehouse);
    default:
      return false;
  }
}
