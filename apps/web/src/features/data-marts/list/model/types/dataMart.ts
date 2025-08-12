import { DataStorageType } from '../../../../data-storage';
import type { DataMartDefinitionConfig } from '../../../edit/model/types/data-mart-definition-config';
import type { DataMartStatusInfo, DataMartDefinitionType } from '../../../shared';

export interface DataMartListItem {
  id: string;
  title: string;
  status: DataMartStatusInfo;
  storageType: DataStorageType;
  storageTitle?: string;
  triggersCount: number;
  reportsCount: number;
  createdAt: Date;
  modifiedAt: Date;
  definitionType: DataMartDefinitionType | null;
  definition: DataMartDefinitionConfig | null;
}
