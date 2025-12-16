import { RedshiftConnectionType } from './credentials';

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

export interface RedshiftServerlessConfig {
  connectionType: RedshiftConnectionType.SERVERLESS;
  region: string;
  database: string;
  workgroupName: string;
}

export interface RedshiftProvisionedConfig {
  connectionType: RedshiftConnectionType.PROVISIONED;
  region: string;
  database: string;
  clusterIdentifier: string;
}

export type RedshiftDataStorageConfig = RedshiftServerlessConfig | RedshiftProvisionedConfig;

export type DataStorageConfig =
  | GoogleBigQueryDataStorageConfig
  | AwsAthenaDataStorageConfig
  | SnowflakeDataStorageConfig
  | RedshiftDataStorageConfig;

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

export function isRedshiftDataStorageConfig(
  config: DataStorageConfig
): config is RedshiftDataStorageConfig {
  if (!('connectionType' in config)) {
    return false;
  }
  const typedConfig = config as { connectionType: unknown };
  return (
    typedConfig.connectionType === RedshiftConnectionType.SERVERLESS ||
    typedConfig.connectionType === RedshiftConnectionType.PROVISIONED
  );
}
