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
 * Combined type for data storage credentials
 */
export type DataStorageCredentialsDto =
  | GoogleBigQueryCredentialsDto
  | AwsAthenaCredentialsDto
  | SnowflakeCredentialsDto;
