import { z } from 'zod';

export const ScheduledReportRunConfigType = 'scheduled-report-run-config';

export const ScheduledReportRunConfigSchema = z.object({
  type: z.literal(ScheduledReportRunConfigType),
  reportId: z.string().min(1, 'Correct Report ID is required'),
});

export type ScheduledReportRunConfig = z.infer<typeof ScheduledReportRunConfigSchema>;
