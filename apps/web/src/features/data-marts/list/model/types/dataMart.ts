import { DataStorageType } from '../../../../data-storage';

export interface DataMartListItem {
  id: string;
  title: string;
  storageType: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
}
