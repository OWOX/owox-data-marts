import { DataStorageType } from '../../../../data-storage';
import type { DataMartStatusInfo } from '../../../shared';

export interface DataMartListItem {
  id: string;
  title: string;
  status: DataMartStatusInfo;
  storageType: DataStorageType;
  createdAt: Date;
  modifiedAt: Date;
}
