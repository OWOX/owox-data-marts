import type { UserProjectionDto } from '../../../../../../shared/types/api';
import { DataMartDefinitionType, DataMartStatus } from '../../../enums';
import type { DataMartListItemStorageDto } from './data-mart-list-item-storage.dto';
import type { DataLastUpdatedDto } from './data-mart-data-last-updated.dto';
import type { DataMartIconValue } from '../../../enums/data-mart-icon.enum';
import type { ContextSummary } from '../../../../../contexts/types/context.types';

/**
 * Lightweight data mart response DTO for list endpoint
 */
export interface DataMartListItemResponseDto {
  id: string;
  title: string;
  icon?: DataMartIconValue | null;
  status: DataMartStatus;
  storage: DataMartListItemStorageDto;
  definitionType: DataMartDefinitionType | null;
  connectorSourceName: string | null;
  triggersCount: number;
  reportsCount: number;
  /** Relationships the Data Mart defines plus the ones that point to it. */
  relationshipsCount?: number;
  createdByUser: UserProjectionDto | null;
  businessOwnerUsers?: UserProjectionDto[];
  technicalOwnerUsers?: UserProjectionDto[];
  createdAt: Date;
  modifiedAt: Date;
  contexts?: ContextSummary[];
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
  dataLastUpdated?: DataLastUpdatedDto | null;
}
