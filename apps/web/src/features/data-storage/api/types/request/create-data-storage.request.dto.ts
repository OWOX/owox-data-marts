import type { DataStorageType } from '../../../model/types/data-storage-type.enum.ts';

export interface CreateDataStorageRequestDto {
  title: string;
  type: DataStorageType;
}
