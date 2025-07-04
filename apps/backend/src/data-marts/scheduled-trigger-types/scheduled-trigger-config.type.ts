import { z } from 'zod';
import { ScheduledReportRunConfigSchema } from './scheduled-report-run/schemas/scheduled-report-run-config.schema';

export const ScheduledTriggerConfigSchema = z.discriminatedUnion('type', [
  ScheduledReportRunConfigSchema,
]);

export type ScheduledTriggerConfig = z.infer<typeof ScheduledTriggerConfigSchema>;
