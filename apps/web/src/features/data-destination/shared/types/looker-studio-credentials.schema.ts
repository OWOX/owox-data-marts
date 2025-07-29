import { z } from 'zod';

/**
 * Schema for validating Looker Studio credentials
 * Used by Data Destination module
 */
export const lookerStudioCredentialsSchema = z.object({
  deploymentUrl: z
    .string()
    .min(1, 'Deployment URL is required')
    .url(
      'The deployment URL should include the protocol (https://) and domain name. A port may also be included if necessary (e.g., https://example.com:8080)'
    )
    .refine(url => url.startsWith('https://'), {
      message: 'Deployment URL must use HTTPS protocol',
    }),
  destinationId: z.string().optional(),
  destinationSecretKey: z.string().optional(),
});
