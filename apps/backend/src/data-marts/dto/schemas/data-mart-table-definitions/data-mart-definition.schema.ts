import z from 'zod';
import { ConnectorDefinitionSchema } from '../data-mart-table-definitions/connector-definition.schema';
import { SqlDefinitionSchema } from '../data-mart-table-definitions/sql-definition.schema';
import { TableDefinitionSchema } from '../data-mart-table-definitions/table-definition.schema';
import { TablePatternDefinitionSchema } from '../data-mart-table-definitions/table-pattern-definition.schema';
import { ViewDefinitionSchema } from '../data-mart-table-definitions/view-definition.schema';

export const DataMartDefinitionSchema = z.union([
  SqlDefinitionSchema,
  TableDefinitionSchema,
  TablePatternDefinitionSchema,
  ViewDefinitionSchema,
  ConnectorDefinitionSchema,
]);
