import { type DataStorageResponseDto } from '../../../../../data-storage/shared/api/types';
import { DataMartStatus } from '../../../enums/data-mart-status.enum';
import { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import type { SqlDefinitionConfig } from '../../../../edit/model/types/sql-definition-config.ts';
import type { TableDefinitionConfig } from '../../../../edit/model/types/table-definition-config.ts';
import type { TablePatternDefinitionConfig } from '../../../../edit/model/types/table-pattern-definition-config.ts';
import type { ViewDefinitionConfig } from '../../../../edit/model/types/view-definition-config.ts';

/**
 * Data mart definition type
 */
export type DataMartDefinition =
  | SqlDefinitionConfig
  | TableDefinitionConfig
  | TablePatternDefinitionConfig
  | ViewDefinitionConfig;

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
  definition: DataMartDefinition | null;

  /**
   * Description of the data mart
   */
  description: string | null;

  /**
   * Creation timestamp
   */
  createdAt: Date;

  /**
   * Last modification timestamp
   */
  modifiedAt: Date;
}
