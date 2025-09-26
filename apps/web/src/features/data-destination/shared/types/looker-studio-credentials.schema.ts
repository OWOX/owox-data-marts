import { z } from 'zod';

/**
 * Schema for validating Looker Studio credentials
 * Used by Data Destination module
 */
export const lookerStudioCredentialsSchema = z.object({
  deploymentUrl: z.string().optional(),
  destinationId: z.string().optional(),
  destinationSecretKey: z.string().optional(),
});
