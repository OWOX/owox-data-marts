import type { SqlDefinitionConfig } from './sql-definition-config';
import type { TableDefinitionConfig } from './table-definition-config';
import type { ViewDefinitionConfig } from './view-definition-config';
import type { TablePatternDefinitionConfig } from './table-pattern-definition-config';
import type { ConnectorDefinitionConfig } from './connector-definition-config';

export type DataMartDefinitionConfigDto =
  | SqlDefinitionConfig
  | TableDefinitionConfig
  | ViewDefinitionConfig
  | TablePatternDefinitionConfig
  | ConnectorDefinitionConfig;

export type DataMartDefinitionConfig = DataMartDefinitionConfigDto;
