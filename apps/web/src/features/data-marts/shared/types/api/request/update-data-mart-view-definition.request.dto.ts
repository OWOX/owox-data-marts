import type { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import type { ViewDefinitionDto } from '../shared';

/**
 * Update data mart view definition request data transfer object
 */
export interface UpdateDataMartViewDefinitionRequestDto {
  /**
   * Type of data mart definition
   */
  definitionType: DataMartDefinitionType.VIEW;

  /**
   * View definition data
   */
  definition: ViewDefinitionDto;
}
