import type { UpdateDataMartSqlDefinitionRequestDto } from './update-data-mart-sql-definition.request.dto';
import type { UpdateDataMartTableDefinitionRequestDto } from './update-data-mart-table-definition.request.dto';
import type { UpdateDataMartViewDefinitionRequestDto } from './update-data-mart-view-definition.request.dto';
import type { UpdateDataMartTablePatternDefinitionRequestDto } from './update-data-mart-table-pattern-definition.request.dto';
import type { UpdateDataMartConnectorDefinitionRequestDto } from './update-data-mart-connector-definition.request.dto';

/**
 * Update data mart definition request data transfer object
 * Union type for all possible definition update requests
 */
export type UpdateDataMartDefinitionRequestDto =
  | UpdateDataMartSqlDefinitionRequestDto
  | UpdateDataMartTableDefinitionRequestDto
  | UpdateDataMartViewDefinitionRequestDto
  | UpdateDataMartTablePatternDefinitionRequestDto
  | UpdateDataMartConnectorDefinitionRequestDto;
