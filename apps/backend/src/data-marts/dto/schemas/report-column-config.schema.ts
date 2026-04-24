import { z } from 'zod';

// Accepts `[]` so pre-existing rows stay loadable through the Zod transformer on
// `Report.columnConfig`. Empty string items remain rejected — they were never valid.
export const ReportColumnConfigSchema = z.array(z.string().min(1)).nullable();
export type ReportColumnConfig = z.infer<typeof ReportColumnConfigSchema>;
