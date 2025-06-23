import type { DataStorageCredentialsDto } from '../data-storage-credentials.dto.ts';
import type { DataStorageType } from '../../../model/types';

export interface GoogleBigQueryConfigDto {
  projectId: string;
  location: string;
}

export interface AwsAthenaConfigDto {
  region: string;
  databaseName: string;
  outputBucket: string;
}

export type DataStorageConfigDto = GoogleBigQueryConfigDto | AwsAthenaConfigDto;

export interface DataStorageResponseDto {
  id: string;
  title: string;
  type: DataStorageType;
  credentials: DataStorageCredentialsDto | null;
  config: DataStorageConfigDto | null;
  createdAt: string;
  modifiedAt: string;
}
