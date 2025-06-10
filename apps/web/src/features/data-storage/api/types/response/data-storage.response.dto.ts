import type { DataStorageCredentialsDto } from '../data-storage-credentials.dto.ts';
import type { DataStorageType } from '../../../model/types/data-storage-type.enum.ts';

export interface DataStorageResponseDto {
  id: string;
  title: string;
  type: DataStorageType;
  createdAt: string;
  modifiedAt: string;
  credentials: DataStorageCredentialsDto;
}
