import { z } from 'zod';

/**
 * Schema for validating Looker Studio credentials
 * Used by Data Destination module
 */
export const lookerStudioCredentialsSchema = z.object({
  urlHost: z.string().min(1, 'URL Host is required').url('URL Host must be a valid URL'),
});
