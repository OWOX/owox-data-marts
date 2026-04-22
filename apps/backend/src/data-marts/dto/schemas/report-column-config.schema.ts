import { z } from 'zod';

export const ReportColumnConfigSchema = z.array(z.string().min(1)).min(1).nullable();
export type ReportColumnConfig = z.infer<typeof ReportColumnConfigSchema>;
