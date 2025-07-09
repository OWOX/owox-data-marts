import { DataStorageType } from '../../../../data-storage';
import type { DataMartStatusInfo, DataMartDefinitionType } from '../../../shared';

export interface DataMartListItem {
  id: string;
  title: string;
  status: DataMartStatusInfo;
  storageType: DataStorageType;
  storageTitle?: string;
  createdAt: Date;
  modifiedAt: Date;
  definitionType: DataMartDefinitionType | null;
}
