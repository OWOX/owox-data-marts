import { z } from 'zod';

export const ConnectionConfigSchema = z.object({
  deploymentUrl: z.string().url(),
  destinationId: z.string(),
  destinationSecretKey: z.string(),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;
