import { type DataStorageResponseDto } from '../../../../../data-storage/shared/api/types';
import { DataMartStatus } from '../../../enums';
import { DataMartDefinitionType } from '../../../enums';
import type { DataMartDefinitionDto } from './data-mart-definition.dto';
import type { DataMartSchema } from '../../data-mart-schema.types';
import type { ConnectorStateResponseDto } from './connector-state.response.dto';

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
  triggersCount: number;
  reportsCount: number;
  createdAt: Date;
  modifiedAt: Date;
  schema: DataMartSchema | null;
  connectorState?: ConnectorStateResponseDto | null;
}
