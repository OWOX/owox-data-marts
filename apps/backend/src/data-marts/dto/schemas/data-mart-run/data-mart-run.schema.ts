import { z } from 'zod';
import { DataMartRunStatus } from '../../../enums/data-mart-run-status.enum';
import { SqlDefinitionSchema } from '../data-mart-table-definitions/sql-definition.schema';
import { ConnectorDefinitionSchema } from '../data-mart-table-definitions/connector-definition.schema';

export const DataMartRunSchema = z.object({
  id: z.string(),
  dataMartId: z.string(),
  definitionRun: z.union([SqlDefinitionSchema, ConnectorDefinitionSchema]),
  status: z.nativeEnum(DataMartRunStatus),
  logs: z.array(z.string()),
  errors: z.array(z.string()),
  createdAt: z.date(),
});

export type DataMartRun = z.infer<typeof DataMartRunSchema>;
