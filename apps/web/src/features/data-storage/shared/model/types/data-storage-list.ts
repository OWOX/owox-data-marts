import type { DataStorageType } from './data-storage-type.enum.ts';

export interface DataStorageListItem {
  id: string;
  type: DataStorageType;
  title: string;
  createdAt: Date;
  modifiedAt: Date;
  dataMartsCount: number;
  draftsCount: number;
}
export type DataStorageList = DataStorageListItem[];
