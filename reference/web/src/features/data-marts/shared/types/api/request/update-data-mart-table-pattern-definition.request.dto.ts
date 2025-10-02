import type { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import type { TablePatternDefinitionDto } from '../shared';

/**
 * Update data mart table pattern definition request data transfer object
 */
export interface UpdateDataMartTablePatternDefinitionRequestDto {
  /**
   * Type of data mart definition
   */
  definitionType: DataMartDefinitionType.TABLE_PATTERN;

  /**
   * Table pattern definition data
   */
  definition: TablePatternDefinitionDto;
}
