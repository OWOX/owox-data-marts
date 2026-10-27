import { DataStorageType } from './data-storage-type.enum.ts';
import type {
  AwsAthenaDataStorageConfig,
  DataStorageConfig,
  GoogleBigQueryDataStorageConfig,
  SnowflakeDataStorageConfig,
  RedshiftDataStorageConfig,
  DatabricksDataStorageConfig,
} from './data-storage-config.ts';
import type { CredentialState, CredentialSummary } from '../../../../credentials/types';
import type { ContextSummary } from '../../../../contexts/types/context.types';

export type StorageCredentialState = CredentialState;

export type StorageCredentialSummary = CredentialSummary;

export interface BaseDataStorage<C extends DataStorageConfig> {
  id: string;
  title: string;
  type: DataStorageType;
  config: C;
  createdAt: Date;
  modifiedAt: Date;
  createdByUser?: import('../../../../../shared/types').UserProjection | null;
  ownerUsers?: import('../../../../../shared/types').UserProjection[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contexts?: ContextSummary[];
  /** null when the Storage has neither a Credential nor its own key; absent on a Storage embedded in a Data Mart. */
  reusableCredential?: StorageCredentialSummary | null;
}

export interface GoogleBigQueryDataStorage extends BaseDataStorage<GoogleBigQueryDataStorageConfig> {
  type: DataStorageType.GOOGLE_BIGQUERY;
  config: GoogleBigQueryDataStorageConfig;
}

export interface LegacyGoogleBigQueryDataStorage extends BaseDataStorage<GoogleBigQueryDataStorageConfig> {
  type: DataStorageType.LEGACY_GOOGLE_BIGQUERY;
  config: GoogleBigQueryDataStorageConfig;
}

export interface AwsAthenaDataStorage extends BaseDataStorage<AwsAthenaDataStorageConfig> {
  type: DataStorageType.AWS_ATHENA;
  config: AwsAthenaDataStorageConfig;
}

export interface SnowflakeDataStorage extends BaseDataStorage<SnowflakeDataStorageConfig> {
  type: DataStorageType.SNOWFLAKE;
  config: SnowflakeDataStorageConfig;
}

export interface RedshiftDataStorage extends BaseDataStorage<RedshiftDataStorageConfig> {
  type: DataStorageType.AWS_REDSHIFT;
  config: RedshiftDataStorageConfig;
}

export interface DatabricksDataStorage extends BaseDataStorage<DatabricksDataStorageConfig> {
  type: DataStorageType.DATABRICKS;
  config: DatabricksDataStorageConfig;
}

export type DataStorage =
  | GoogleBigQueryDataStorage
  | LegacyGoogleBigQueryDataStorage
  | AwsAthenaDataStorage
  | SnowflakeDataStorage
  | RedshiftDataStorage
  | DatabricksDataStorage;

export function isGoogleBigQueryStorage(
  storage: DataStorage
): storage is GoogleBigQueryDataStorage {
  return storage.type === DataStorageType.GOOGLE_BIGQUERY;
}

export function isLegacyGoogleBigQueryStorage(
  storage: DataStorage
): storage is LegacyGoogleBigQueryDataStorage {
  return storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY;
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
