import { z } from 'zod';

export const SnowflakeConfigSchema = z.object({
  account: z.string().min(1, 'account is required'),
  warehouse: z.string().min(1, 'warehouse is required'),
});

export type SnowflakeConfig = z.infer<typeof SnowflakeConfigSchema>;
