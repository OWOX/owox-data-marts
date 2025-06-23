import type { DataStorage } from '../../../../data-storage/shared/model/types/data-storage.ts';
import type { DataMartStatusInfo } from '../../../shared';
import type { DataMartDefinitionConfig } from './data-mart-definition-config.ts';
import type { DataMartDefinitionType } from '../../../shared/enums/data-mart-definition-type.enum.ts';

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
   * Creation date
   */
  createdAt: Date;

  /**
   * Last modification date
   */
  modifiedAt: Date;
}
