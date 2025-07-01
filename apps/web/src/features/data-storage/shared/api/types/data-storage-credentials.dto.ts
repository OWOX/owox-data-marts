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
 * Combined type for data storage credentials
 */
export type DataStorageCredentialsDto = GoogleBigQueryCredentialsDto | AwsAthenaCredentialsDto;
