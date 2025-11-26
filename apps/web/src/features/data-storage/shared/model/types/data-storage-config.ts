export interface GoogleBigQueryDataStorageConfig {
  projectId: string;
  location: string;
}
export interface AwsAthenaDataStorageConfig {
  region: string;
  outputBucket: string;
}
export interface SnowflakeDataStorageConfig {
  account: string;
  warehouse: string;
}

export type DataStorageConfig =
  | GoogleBigQueryDataStorageConfig
  | AwsAthenaDataStorageConfig
  | SnowflakeDataStorageConfig;

export function isGoogleBigQueryDataStorageConfig(
  config: DataStorageConfig
): config is GoogleBigQueryDataStorageConfig {
  return 'projectId' in config;
}

export function isAwsAthenaDataStorageConfig(
  config: DataStorageConfig
): config is AwsAthenaDataStorageConfig {
  return 'outputBucket' in config;
}

export function isSnowflakeDataStorageConfig(
  config: DataStorageConfig
): config is SnowflakeDataStorageConfig {
  return 'account' in config && 'warehouse' in config;
}
