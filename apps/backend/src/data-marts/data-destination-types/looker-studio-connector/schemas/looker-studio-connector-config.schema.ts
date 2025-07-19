import { z } from 'zod';

export const LookerStudioConnectorConfigType = 'looker-studio-connector-config';
export const LookerStudioConnectorConfigSchema = z.object({
  type: z.literal(LookerStudioConnectorConfigType),
  dataMartAlias: z.string().nullable().describe('Alternative data mart alias to show in connector'),
});

export type LookerStudioConnectorConfig = z.infer<typeof LookerStudioConnectorConfigSchema>;
