import { SqlDefinition } from './sql-definition.schema';
import { TableDefinition } from './table-definition.schema';
import { TablePatternDefinition } from './table-pattern-definition.schema';
import { ViewDefinition } from './view-definition.schema';
import { ConnectorDefinition } from './connector-definition.schema';
import { InsightRunDefinition } from './insight-run-definition.schema';

export type DataMartDefinition =
  | SqlDefinition
  | TableDefinition
  | TablePatternDefinition
  | ViewDefinition
  | ConnectorDefinition
  | InsightRunDefinition;
