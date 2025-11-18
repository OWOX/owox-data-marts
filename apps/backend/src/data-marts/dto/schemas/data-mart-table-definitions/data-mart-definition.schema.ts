import z from 'zod';
import { ConnectorDefinitionSchema } from './connector-definition.schema';
import { SqlDefinitionSchema } from './sql-definition.schema';
import { TableDefinitionSchema } from './table-definition.schema';
import { TablePatternDefinitionSchema } from './table-pattern-definition.schema';
import { ViewDefinitionSchema } from './view-definition.schema';
import { InsightRunDefinitionSchema } from './insight-run-definition.schema';

export const DataMartDefinitionSchema = z.union([
  SqlDefinitionSchema,
  TableDefinitionSchema,
  TablePatternDefinitionSchema,
  ViewDefinitionSchema,
  ConnectorDefinitionSchema,
  InsightRunDefinitionSchema,
]);
