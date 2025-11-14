import { z } from 'zod';

/**
 * Schema for validating Email credentials
 * Used by Data Destination module
 */
export const emailCredentialsSchema = z.object({
  to: z.array(z.string().email()).min(1),
});
