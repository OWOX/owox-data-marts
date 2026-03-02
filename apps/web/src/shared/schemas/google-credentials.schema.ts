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

/**
 * Schema for Google credentials that supports both Service Account and OAuth.
 * OAuth is managed via credentialId on the parent entity.
 * At least one authentication method must be provided: a new serviceAccount JSON
 * or an existing credentialId (which could be either a SA or OAuth credential).
 */
export const googleCredentialsWithOAuthSchema = z
  .object({
    serviceAccount: z.string().optional(),
    credentialId: z.string().uuid('Invalid credential ID').nullable().optional(),
  })
  .refine(
    data => {
      const hasServiceAccount = !!data.serviceAccount && data.serviceAccount.trim().length > 0;
      const hasCredentialId = !!data.credentialId && data.credentialId.trim().length > 0;
      return hasServiceAccount || hasCredentialId;
    },
    {
      message: 'Either Service Account or OAuth connection must be provided',
      path: ['serviceAccount'],
    }
  );
