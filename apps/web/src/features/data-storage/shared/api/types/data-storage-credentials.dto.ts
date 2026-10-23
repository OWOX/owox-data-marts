import type { GoogleServiceAccountCredentialsDto } from '../../../../../shared/types';

/**
 * AWS Athena credentials DTO interface
 */
export interface AwsAthenaCredentialsDto {
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Google BigQuery credentials DTO interface based on Service Account structure
 */
export type GoogleBigQueryCredentialsDto = GoogleServiceAccountCredentialsDto;

/**
 * Snowflake credentials DTO interface
 */
export interface SnowflakeCredentialsDto {
  authMethod?: string;
  username?: string;
  password?: string;
  privateKey?: string;
  privateKeyPassphrase?: string;
}

/**
 * AWS Redshift credentials DTO interface
 */
export interface RedshiftCredentialsDto {
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Databricks credentials DTO interface
 */
export interface DatabricksCredentialsDto {
  authMethod?: string;
  token?: string;
}

/**
 * DuckDB credentials DTO interface — always empty (credential-less storage).
 */
export type DuckDbCredentialsDto = Record<string, never>;

/**
 * Combined type for data storage credentials
 */
export type DataStorageCredentialsDto =
  | GoogleBigQueryCredentialsDto
  | AwsAthenaCredentialsDto
  | SnowflakeCredentialsDto
  | RedshiftCredentialsDto
  | DatabricksCredentialsDto
  | DuckDbCredentialsDto;
