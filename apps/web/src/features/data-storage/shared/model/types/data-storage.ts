import type {
  AwsAthenaCredentials,
  DataStorageCredentials,
  GoogleBigQueryCredentials,
  SnowflakeCredentials,
  RedshiftCredentials,
  DatabricksCredentials,
} from './credentials.ts';
import { DataStorageType } from './data-storage-type.enum.ts';
import type {
  AwsAthenaDataStorageConfig,
  DataStorageConfig,
  GoogleBigQueryDataStorageConfig,
  SnowflakeDataStorageConfig,
  RedshiftDataStorageConfig,
  DatabricksDataStorageConfig,
} from './data-storage-config.ts';

export interface BaseDataStorage<T extends DataStorageCredentials, C extends DataStorageConfig> {
  id: string;
  title: string;
  type: DataStorageType;
  credentials: T;
  config: C;
  createdAt: Date;
  modifiedAt: Date;
}

export interface GoogleBigQueryDataStorage extends BaseDataStorage<
  GoogleBigQueryCredentials,
  GoogleBigQueryDataStorageConfig
> {
  type: DataStorageType.GOOGLE_BIGQUERY;
  config: GoogleBigQueryDataStorageConfig;
}

export interface AwsAthenaDataStorage extends BaseDataStorage<
  AwsAthenaCredentials,
  AwsAthenaDataStorageConfig
> {
  type: DataStorageType.AWS_ATHENA;
  config: AwsAthenaDataStorageConfig;
}

export interface SnowflakeDataStorage extends BaseDataStorage<
  SnowflakeCredentials,
  SnowflakeDataStorageConfig
> {
  type: DataStorageType.SNOWFLAKE;
  config: SnowflakeDataStorageConfig;
}

export interface RedshiftDataStorage extends BaseDataStorage<
  RedshiftCredentials,
  RedshiftDataStorageConfig
> {
  type: DataStorageType.AWS_REDSHIFT;
  config: RedshiftDataStorageConfig;
}

export interface DatabricksDataStorage extends BaseDataStorage<
  DatabricksCredentials,
  DatabricksDataStorageConfig
> {
  type: DataStorageType.DATABRICKS;
  config: DatabricksDataStorageConfig;
}

export type DataStorage =
  | GoogleBigQueryDataStorage
  | AwsAthenaDataStorage
  | SnowflakeDataStorage
  | RedshiftDataStorage
  | DatabricksDataStorage;

export function isGoogleBigQueryStorage(
  storage: DataStorage
): storage is GoogleBigQueryDataStorage {
  return storage.type === DataStorageType.GOOGLE_BIGQUERY;
}

export function isAwsAthenaStorage(storage: DataStorage): storage is AwsAthenaDataStorage {
  return storage.type === DataStorageType.AWS_ATHENA;
}

export function isSnowflakeStorage(storage: DataStorage): storage is SnowflakeDataStorage {
  return storage.type === DataStorageType.SNOWFLAKE;
}

export function isRedshiftStorage(storage: DataStorage): storage is RedshiftDataStorage {
  return storage.type === DataStorageType.AWS_REDSHIFT;
}

export function isDatabricksStorage(storage: DataStorage): storage is DatabricksDataStorage {
  return storage.type === DataStorageType.DATABRICKS;
}
