import { z } from 'zod';

export const LookerStudioConnectorCredentialsType = 'looker-studio-credentials';

export const LookerStudioConnectorCredentialsSchema = z
  .object({
    type: z.literal(LookerStudioConnectorCredentialsType),
    destinationSecretKey: z.string().optional(),
  })
  .passthrough();

export type LookerStudioConnectorCredentials = z.infer<
  typeof LookerStudioConnectorCredentialsSchema
>;
