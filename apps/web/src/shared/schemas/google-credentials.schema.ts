import { z } from 'zod';

/**
 * Schema for validating Google Service Account JSON credentials
 * Used by both Data Storage and Data Destination modules
 */
export const googleServiceAccountSchema = z.object({
  serviceAccount: z
    .string()
    .min(1, 'Service Account Key is required')
    .transform((str, ctx) => {
      try {
        const parsed = JSON.parse(str) as { client_email: string; private_key: string };

        if (typeof parsed !== 'object') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Service Account must be a valid JSON object',
          });
          return z.NEVER;
        }

        if (!parsed.client_email) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Service Account must contain a client_email field',
          });
          return z.NEVER;
        }

        if (!parsed.private_key) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Service Account must contain a private_key field',
          });
          return z.NEVER;
        }

        return str;
      } catch (e) {
        console.error(e);
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Service Account must be a valid JSON string',
        });
        return z.NEVER;
      }
    }),
});
