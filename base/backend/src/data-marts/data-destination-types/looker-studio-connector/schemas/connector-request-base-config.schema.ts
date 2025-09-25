import { z } from 'zod';

export const ConnectorRequestBaseConfigSchema = z.object({
  destinationId: z.string(),
});

export type ConnectorRequestBaseConfig = z.infer<typeof ConnectorRequestBaseConfigSchema>;
