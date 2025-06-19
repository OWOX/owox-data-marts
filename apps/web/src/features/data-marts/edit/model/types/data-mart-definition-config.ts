import type { SqlDefinitionConfig } from './sql-definition-config.ts';
import type { TableDefinitionConfig } from './table-definition-config.ts';
import type { TablePatternDefinitionConfig } from './table-pattern-definition-config.ts';
import type { ViewDefinitionConfig } from './view-definition-config.ts';

export type DataMartDefinitionConfig =
  | SqlDefinitionConfig
  | TableDefinitionConfig
  | TablePatternDefinitionConfig
  | ViewDefinitionConfig;
