import type { DataStorageCredentialsDto } from '../data-storage-credentials.dto.ts';

export interface UpdateDataStorageRequestDto {
  title: string;
  credentials: DataStorageCredentialsDto;
}
