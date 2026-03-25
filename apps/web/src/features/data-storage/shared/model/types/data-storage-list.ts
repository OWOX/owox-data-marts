import type { DataStorageType } from './data-storage-type.enum.ts';

export interface DataStorageListItem {
  id: string;
  type: DataStorageType;
  title: string;
  createdAt: Date;
  modifiedAt: Date;
  publishedDataMartsCount: number;
  draftDataMartsCount: number;
  createdByUser?: import('../../../../../shared/types').UserProjection | null;
}
export type DataStorageList = DataStorageListItem[];
