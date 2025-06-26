import type { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import type { TableDefinitionDto } from '../shared';

/**
 * Update data mart table definition request data transfer object
 */
export interface UpdateDataMartTableDefinitionRequestDto {
  /**
   * Type of data mart definition
   */
  definitionType: DataMartDefinitionType.TABLE;

  /**
   * Table definition data
   */
  definition: TableDefinitionDto;
}
