import { DataStorageType } from '../../../types';
import type { DataStorageCredentialsDto } from '../data-storage-credentials.dto.ts';

export interface DataStorageResponseDto {
  id: string;
  title: string;
  type: DataStorageType;
  createdAt: string;
  modifiedAt: string;
  credentials: DataStorageCredentialsDto;
}
