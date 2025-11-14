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
  /**
   * Unique identifier of the data mart
   */
  id: string;

  /**
   * Title of the data mart
   */
  title: string;

  /**
   * Status of the data mart
   */
  status: DataMartStatus;

  /**
   * Storage information for the data mart
   */
  storage: DataStorageResponseDto;

  /**
   * Type of data mart definition
   */
  definitionType: DataMartDefinitionType | null;

  /**
   * Definition of the data mart
   */
  definition: DataMartDefinitionDto | null;

  /**
   * Description of the data mart
   */
  description: string | null;

  /**
   * Number of triggers of the data mart
   */
  triggersCount: number;

  /**
   * Number of reports of the data mart
   */
  reportsCount: number;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;

  /**
   * Schema of the data mart
   */
  schema: DataMartSchema | null;

  /**
   * Connector state information
   */
  connectorState?: ConnectorStateResponseDto | null;
}
