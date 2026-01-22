import { ConnectorDefinition } from './connector-definition.schema';
import { LegacyExtensionSqlDefinition } from './legacy-extension-sql-definition.schema';
import { SqlDefinition } from './sql-definition.schema';
import { TableDefinition } from './table-definition.schema';
import { TablePatternDefinition } from './table-pattern-definition.schema';
import { ViewDefinition } from './view-definition.schema';

export type DataMartDefinition =
  | SqlDefinition
  | TableDefinition
  | TablePatternDefinition
  | ViewDefinition
  | ConnectorDefinition
  | LegacyExtensionSqlDefinition;
