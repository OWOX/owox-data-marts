import { DataStorageType } from '../../../../data-storage';

/** Maximum number of data marts the user can create in a single bulk operation. */
export const MAX_BULK_DATA_MART_COUNT = 20;

/**
 * Storage types that are eligible to seed bulk data mart creation. Legacy BigQuery is
 * deliberately excluded — those data marts must use SQL definition type and are produced
 * automatically, so a bulk create-from-resource flow does not apply to them.
 */
export const BULK_CREATE_SUPPORTED_STORAGE_TYPES: ReadonlySet<DataStorageType> = new Set([
  DataStorageType.GOOGLE_BIGQUERY,
]);
