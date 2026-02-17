import type { UserProjectionDto } from '../../../../../shared/types/api';
import { DataStorageType } from '../../../../data-storage';
import type { DataMartStatusInfo, DataMartDefinitionType } from '../../../shared';

export interface DataMartListItem {
  id: string;
  title: string;
  status: DataMartStatusInfo;
  storageType: DataStorageType;
  storageTitle?: string;
  triggersCount: number;
  reportsCount: number;
  createdByUser: UserProjectionDto | null;
  createdAt: Date;
  modifiedAt: Date;
  definitionType: DataMartDefinitionType | null;
  connectorSourceName: string | null;
}
