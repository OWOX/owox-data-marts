import { z } from 'zod';

export const LookerStudioConnectorCredentialsType = 'looker-studio-credentials';

export const LookerStudioConnectorCredentialsSchema = z
  .object({
    type: z.literal(LookerStudioConnectorCredentialsType),
    deploymentUrl: z
      .string()
      .min(1, 'Deployment URL is required')
      .url(
        'The deployment URL should include the protocol (https://) and domain name. A port may also be included if necessary (e.g., https://example.com:8080)'
      )
      .refine(url => url.startsWith('https://'), {
        message: 'Deployment URL must use HTTPS protocol',
      }),
    destinationSecretKey: z.string().optional(),
  })
  .passthrough();

export type LookerStudioConnectorCredentials = z.infer<
  typeof LookerStudioConnectorCredentialsSchema
>;
