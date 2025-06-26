import type { DataMartDefinitionType } from '../../../enums/data-mart-definition-type.enum';
import type { SqlDefinitionDto } from '../shared';

/**
 * Update data mart SQL definition request data transfer object
 */
export interface UpdateDataMartSqlDefinitionRequestDto {
  /**
   * Type of data mart definition
   */
  definitionType: DataMartDefinitionType.SQL;

  /**
   * SQL definition data
   */
  definition: SqlDefinitionDto;
}
