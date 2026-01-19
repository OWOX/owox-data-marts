import { z } from 'zod';

export const DatabricksConfigSchema = z.object({
  host: z.string().min(1),
  httpPath: z.string().min(1),
  catalog: z.string().optional(),
  schema: z.string().optional(),
});

export type DatabricksConfig = z.infer<typeof DatabricksConfigSchema>;
