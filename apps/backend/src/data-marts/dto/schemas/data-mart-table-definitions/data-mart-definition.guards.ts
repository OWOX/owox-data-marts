import { ConnectorDefinition, ConnectorDefinitionSchema } from './connector-definition.schema';
import { DataMartDefinition } from './data-mart-definition';
import { SqlDefinition, SqlDefinitionSchema } from './sql-definition.schema';
import { TableDefinition, TableDefinitionSchema } from './table-definition.schema';
import {
  TablePatternDefinition,
  TablePatternDefinitionSchema,
} from './table-pattern-definition.schema';
import { ViewDefinition, ViewDefinitionSchema } from './view-definition.schema';

export function isSqlDefinition(definition: DataMartDefinition): definition is SqlDefinition {
  return SqlDefinitionSchema.safeParse(definition).success;
}

export function isTableDefinition(definition: DataMartDefinition): definition is TableDefinition {
  return TableDefinitionSchema.safeParse(definition).success;
}

export function isTablePatternDefinition(
  definition: DataMartDefinition
): definition is TablePatternDefinition {
  return TablePatternDefinitionSchema.safeParse(definition).success;
}

export function isViewDefinition(definition: DataMartDefinition): definition is ViewDefinition {
  return ViewDefinitionSchema.safeParse(definition).success;
}

export function isConnectorDefinition(
  definition: DataMartDefinition
): definition is ConnectorDefinition {
  return ConnectorDefinitionSchema.safeParse(definition).success;
}
