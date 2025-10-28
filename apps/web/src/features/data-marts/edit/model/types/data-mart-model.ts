import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage.ts';
import type { DataMartStatusInfo, DataMartValidationError } from '../../../shared';
import type { DataMartDefinitionConfig } from './data-mart-definition-config.ts';
import type { DataMartDefinitionType } from '../../../shared';
import type { DataMartSchema } from '../../../shared/types/data-mart-schema.types';
import type { ConnectorListItem } from '../../../../connectors/shared/model/types/connector';

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
   * Connector info (logo and metadata) if definition type is CONNECTOR
   */
  connectorInfo: ConnectorListItem | null;

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
}
