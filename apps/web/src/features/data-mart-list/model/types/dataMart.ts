import { DataStorageType } from '../../../../shared';

export interface DataMartListItem {
  id: string;
  title: string;
  storageType: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
}
