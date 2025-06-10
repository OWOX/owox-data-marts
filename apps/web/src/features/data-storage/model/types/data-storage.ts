import type {
  AwsAthenaCredentials,
  DataStorageCredentials,
  GoogleBigQueryCredentials,
} from './credentials';
import { DataStorageType } from './data-storage-type.enum';

export interface BaseDataStorage<T extends DataStorageCredentials> {
  id: string;
  title: string;
  type: DataStorageType;
  credentials: T;
  createdAt: Date;
  modifiedAt: Date;
}

export interface GoogleBigQueryDataStorage extends BaseDataStorage<GoogleBigQueryCredentials> {
  type: DataStorageType.GOOGLE_BIGQUERY;
}

export interface AwsAthenaDataStorage extends BaseDataStorage<AwsAthenaCredentials> {
  type: DataStorageType.AWS_ATHENA;
}

export type DataStorage = GoogleBigQueryDataStorage | AwsAthenaDataStorage;

export function isGoogleBigQueryStorage(
  storage: DataStorage
): storage is GoogleBigQueryDataStorage {
  return storage.type === DataStorageType.GOOGLE_BIGQUERY;
}

export function isAwsAthenaStorage(storage: DataStorage): storage is AwsAthenaDataStorage {
  return storage.type === DataStorageType.AWS_ATHENA;
}
