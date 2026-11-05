export enum RedshiftConnectionType {
  SERVERLESS = 'SERVERLESS',
  PROVISIONED = 'PROVISIONED',
}

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

export interface DatabricksDataStorageConfig {
  host: string;
  httpPath: string;
}

// DuckDB has no user-supplied configuration: the .duckdb file path is derived
// at runtime from the storage id + DUCKDB_DATA_DIR. `Record<string, never>`
// (rather than `interface DuckDbDataStorageConfig {}`) precisely types "no
// properties allowed", matching the `config: z.object({})` schema in T3.
export type DuckDbDataStorageConfig = Record<string, never>;

export type DataStorageConfig =
  | GoogleBigQueryDataStorageConfig
  | AwsAthenaDataStorageConfig
  | SnowflakeDataStorageConfig
  | RedshiftDataStorageConfig
  | DatabricksDataStorageConfig
  | DuckDbDataStorageConfig;

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

export function isDatabricksDataStorageConfig(
  config: DataStorageConfig
): config is DatabricksDataStorageConfig {
  return 'host' in config && 'httpPath' in config;
}
