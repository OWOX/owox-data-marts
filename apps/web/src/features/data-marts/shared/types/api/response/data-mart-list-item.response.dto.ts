import type { UserProjectionDto } from '../../../../../../shared/types/api';
import { DataMartDefinitionType, DataMartStatus } from '../../../enums';
import type { DataMartListItemStorageDto } from './data-mart-list-item-storage.dto';

/**
 * Lightweight data mart response DTO for list endpoint
 */
export interface DataMartListItemResponseDto {
  id: string;
  title: string;
  status: DataMartStatus;
  storage: DataMartListItemStorageDto;
  definitionType: DataMartDefinitionType | null;
  connectorSourceName: string | null;
  triggersCount: number;
  reportsCount: number;
  createdByUser: UserProjectionDto | null;
  createdAt: Date;
  modifiedAt: Date;
}
