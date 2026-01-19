import { z } from 'zod';

export const DatabricksConfigSchema = z.object({
  host: z.string().min(1),
  httpPath: z.string().min(1),
});

export type DatabricksConfig = z.infer<typeof DatabricksConfigSchema>;
