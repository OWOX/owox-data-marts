import { z } from 'zod';

export const LookerStudioConnectorConfigType = 'looker-studio-config';
export const LookerStudioConnectorConfigSchema = z.object({
  type: z.literal(LookerStudioConnectorConfigType),
  cacheLifetime: z.number().min(60),
});

export type LookerStudioConnectorConfig = z.infer<typeof LookerStudioConnectorConfigSchema>;
