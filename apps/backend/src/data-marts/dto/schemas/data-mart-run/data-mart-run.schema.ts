import { z } from 'zod';
import { DataMartRunStatus } from '../../../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../../../enums/data-mart-run-type.enum';
import { RunType } from '../../../../common/scheduler/shared/types';
import { DataMartRunReportDefinitionSchema } from './data-mart-run-report-definition.schema';
import { DataMartDefinitionSchema } from '../data-mart-table-definitions/data-mart-definition.schema';

export const DataMartRunSchema = z.object({
  id: z.string(),
  status: z.nativeEnum(DataMartRunStatus).nullable(),
  type: z.nativeEnum(DataMartRunType).nullable(),
  runType: z.nativeEnum(RunType).nullable(),
  dataMartId: z.string(),
  definitionRun: DataMartDefinitionSchema.nullable(),
  reportId: z.string().nullable(),
  reportDefinition: DataMartRunReportDefinitionSchema.nullable(),
  insightId: z.string().nullable(),
  logs: z.array(z.string()).nullable(),
  errors: z.array(z.string()).nullable(),
  createdAt: z.date(),
  startedAt: z.date().nullable(),
  finishedAt: z.date().nullable(),
});

export type DataMartRun = z.infer<typeof DataMartRunSchema>;
