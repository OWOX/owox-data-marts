import type { DataStorageCredentialsDto } from '../data-storage-credentials.dto.ts';
import type { DataStorageType } from '../../../model/types/data-storage-type.enum.ts';

export interface GoogleBigQueryConfigDto {
  projectId: string;
  location: string;
  datasetId: string;
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
  credentials: DataStorageCredentialsDto;
  config: DataStorageConfigDto;
  createdAt: string;
  modifiedAt: string;
}
