import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage.ts';
import type { DataMartStatusInfo, DataMartValidationError } from '../../../shared';
import type { DataMartDefinitionConfig } from './data-mart-definition-config.ts';
import type { DataMartDefinitionType } from '../../../shared';
import type { DataMartSchema } from '../../../shared/types/data-mart-schema.types';
import type { ConnectorStateResponseDto } from '../../../shared/types/api/response/connector-state.response.dto';

/**
 * Data mart domain model
 */
export interface DataMart {
  /**
   * Unique identifier
   */
  id: string;

  /**
   * Title
   */
  title: string;

  /**
   * Description
   */
  description: string | null;

  /**
   * Status
   */
  status: DataMartStatusInfo;

  /**
   * Storage type
   */
  storage: DataStorage;

  /**
   * Data mart definition type
   */
  definitionType: DataMartDefinitionType | null;

  /**
   * Data mart definition
   */
  definition: DataMartDefinitionConfig | null;

  /**
   * Indicates if the data mart can be published
   */
  canPublish: boolean;

  /**
   * Validation errors that prevent publishing
   */
  validationErrors: DataMartValidationError[];

  /**
   * Creation date
   */
  createdAt: Date;

  /**
   * Last modification date
   */
  modifiedAt: Date;

  /**
   * Data mart schema
   */
  schema: DataMartSchema | null;

  /**
   * Indicates if the data mart schema can be actualizable
   */
  canActualizeSchema: boolean;
  
  /**
   * Connector state (if Data Mart is CONNECTOR-based)
   */
  connectorState?: ConnectorStateResponseDto | null;
}
