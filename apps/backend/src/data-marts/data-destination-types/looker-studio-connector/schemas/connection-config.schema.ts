import { z } from 'zod';

export const ConnectionConfigSchema = z.object({
  destinationUrl: z.string().url(),
  destinationId: z.string(),
  destinationSecret: z.string(),
});

export type ConnectionConfig = z.infer<typeof ConnectionConfigSchema>;
