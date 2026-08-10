import type { UserProjectionDto } from '../../../../../shared/types/api';
import { DataStorageType } from '../../../../data-storage';
import type { DataMartStatusInfo, DataMartDefinitionType } from '../../../shared';
import type { DataLastUpdatedDto } from '../../../shared/types/api/response/data-mart-data-last-updated.dto';

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
  businessOwnerUsers: UserProjectionDto[];
  technicalOwnerUsers: UserProjectionDto[];
  contexts: { id: string; name: string }[];
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
  dataLastUpdated: DataLastUpdatedDto | null;
}
