import type { DataStorageType } from './data-storage-type.enum.ts';

export interface DataStorageListItem {
  id: string;
  type: DataStorageType;
  title: string;
  createdAt: Date;
  modifiedAt: Date;
}
export type DataStorageList = DataStorageListItem[];
