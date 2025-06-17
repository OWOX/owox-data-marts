export interface GoogleBigQueryDataStorageConfig {
  projectId: string;
  location: string;
}
export interface AwsAthenaDataStorageConfig {
  region: string;
  databaseName: string;
  outputBucket: string;
}

export type DataStorageConfig = GoogleBigQueryDataStorageConfig | AwsAthenaDataStorageConfig;

export function isGoogleBigQueryDataStorageConfig(
  config: DataStorageConfig
): config is GoogleBigQueryDataStorageConfig {
  return 'projectId' in config;
}

export function isAwsAthenaDataStorageConfig(
  config: DataStorageConfig
): config is AwsAthenaDataStorageConfig {
  return 'databaseName' in config && 'outputBucket' in config;
}
