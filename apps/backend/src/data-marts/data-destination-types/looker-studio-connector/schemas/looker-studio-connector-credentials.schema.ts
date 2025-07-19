import { z } from 'zod';

export const LookerStudioConnectorCredentialsType = 'looker-studio-connector-credentials';

export const LookerStudioConnectorCredentialsSchema = z
  .object({
    type: z.literal(LookerStudioConnectorCredentialsType),
    secret: z.string().min(1, 'connector auth secret is required'),
  })
  .passthrough();

export type LookerStudioConnectorCredentials = z.infer<
  typeof LookerStudioConnectorCredentialsSchema
>;
