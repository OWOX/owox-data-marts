import { DataStorageType } from '../../../types';

export interface CreateDataStorageRequestDto {
  title: string;
  type: DataStorageType;
}
