import type { UserProjectionDto } from '../../../../../../shared/types/api';
import { type DataStorageResponseDto } from '../../../../../data-storage/shared/api/types';
import { DataMartStatus } from '../../../enums';
import { DataMartDefinitionType } from '../../../enums';
import type { DataMartDefinitionDto } from './data-mart-definition.dto';
import type { DataMartSchema } from '../../data-mart-schema.types';
import type { ConnectorStateResponseDto } from './connector-state.response.dto';
import type { BlendedFieldsConfig } from '../../relationship.types';
import type { DataLastUpdatedDto } from './data-mart-data-last-updated.dto';
import type { DataMartIconKey } from '../../../enums/data-mart-icon.enum';

/**
 * Data mart response data transfer object
 */
export interface DataMartResponseDto {
  id: string;
  title: string;
  status: DataMartStatus;
  storage: DataStorageResponseDto;
  definitionType: DataMartDefinitionType | null;
  definition: DataMartDefinitionDto | null;
  description: string | null;
  /** User-picked icon; null draws the default one. */
  icon?: DataMartIconKey | null;
  triggersCount: number;
  reportsCount: number;
  createdByUser: UserProjectionDto | null;
  businessOwnerUsers: UserProjectionDto[];
  technicalOwnerUsers: UserProjectionDto[];
  createdAt: Date;
  modifiedAt: Date;
  schema: DataMartSchema | null;
  connectorState?: ConnectorStateResponseDto | null;
  availableForReporting?: boolean;
  availableForMaintenance?: boolean;
  blendedFieldsConfig?: BlendedFieldsConfig | null;
  contexts?: { id: string; name: string }[];
  dataLastUpdated?: DataLastUpdatedDto | null;
}
