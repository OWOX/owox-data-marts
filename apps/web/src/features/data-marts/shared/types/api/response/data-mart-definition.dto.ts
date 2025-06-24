import type {
  SqlDefinitionDto,
  TableDefinitionDto,
  TablePatternDefinitionDto,
  ViewDefinitionDto,
  ConnectorDefinitionDto,
} from '../shared';

/**
 * Data mart definition type for API responses
 */
export type DataMartDefinitionDto =
  | SqlDefinitionDto
  | TableDefinitionDto
  | TablePatternDefinitionDto
  | ViewDefinitionDto
  | ConnectorDefinitionDto;
