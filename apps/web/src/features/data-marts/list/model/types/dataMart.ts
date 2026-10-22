import type { UserProjectionDto } from '../../../../../shared/types/api';
import { DataStorageType } from '../../../../data-storage';
import type { DataMartStatusInfo, DataMartDefinitionType } from '../../../shared';
import type { DataLastUpdatedDto } from '../../../shared/types/api/response/data-mart-data-last-updated.dto';
import type { ContextSummary } from '../../../../contexts/types/context.types';

export interface DataMartListItem {
  id: string;
  title: string;
  status: DataMartStatusInfo;
  storageType: DataStorageType;
  storageTitle?: string;
  triggersCount: number;
  reportsCount: number;
  /** Relationships the Data Mart defines plus the ones that point to it. */
  relationshipsCount: number;
  createdByUser: UserProjectionDto | null;
  createdAt: Date;
  modifiedAt: Date;
  definitionType: DataMartDefinitionType | null;
  connectorSourceName: string | null;
  businessOwnerUsers: UserProjectionDto[];
  technicalOwnerUsers: UserProjectionDto[];
  contexts: ContextSummary[];
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
  dataLastUpdated: DataLastUpdatedDto | null;
}
