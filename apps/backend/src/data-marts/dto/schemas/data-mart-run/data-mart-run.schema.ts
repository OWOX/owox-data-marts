import { z } from 'zod';
import { DataMartRunStatus } from '../../../enums/data-mart-run-status.enum';
import { DataMartRunType } from 'src/data-marts/enums/data-mart-run-type.enum';
import { RunType } from 'src/common/scheduler/shared/types';
import { DataMartRunReportDefinitionSchema } from 'src/data-marts/dto/schemas/data-mart-run/data-mart-run-report-definition.schema';
import { DataMartDefinitionSchema } from 'src/data-marts/dto/schemas/data-mart-table-definitions/data-mart-definition.schema';

export const DataMartRunSchema = z.object({
  id: z.string(),
  status: z.nativeEnum(DataMartRunStatus).nullable(),
  type: z.nativeEnum(DataMartRunType),
  runType: z.nativeEnum(RunType).nullable(),
  dataMartId: z.string(),
  definitionRun: DataMartDefinitionSchema.nullable(),
  reportDefinition: DataMartRunReportDefinitionSchema.nullable(),
  logs: z.array(z.string()),
  errors: z.array(z.string()),
  createdAt: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
});

export type DataMartRun = z.infer<typeof DataMartRunSchema>;
