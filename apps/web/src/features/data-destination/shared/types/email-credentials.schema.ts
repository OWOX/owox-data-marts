import { z } from 'zod';

/**
 * Schema for validating Email credentials
 * Used by Data Destination module
 */
export const emailCredentialsSchema = z.object({
  to: z.array(z.email()).min(1, 'Array must contain at least 1 element(s)'),
});
