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
 * Why a Service Account value cannot be saved, or `null` when it can. Checks only what the
 * already-saved key shown back in the form also carries (it is validated too, and the server
 * never returns the private part), so an untouched key always passes.
 */
function describeServiceAccountKeyProblem(value: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return 'Service Account must be a valid JSON string';
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return 'Service Account must be a valid JSON object';
  }
  const clientEmail = (parsed as { client_email?: unknown }).client_email;
  if (typeof clientEmail !== 'string' || clientEmail.trim().length === 0) {
    return 'Service Account must contain a client_email field';
  }
  return null;
}

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
  .superRefine((data, ctx) => {
    const serviceAccount = data.serviceAccount?.trim() ?? '';
    const hasCredentialId = !!data.credentialId && data.credentialId.trim().length > 0;

    if (serviceAccount) {
      // A malformed key used to pass here and only fail while building the request, which
      // never pointed at this field. Flag the field instead.
      const problem = describeServiceAccountKeyProblem(serviceAccount);
      if (problem) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: ['serviceAccount'] });
      }
      return;
    }
    if (hasCredentialId) return;

    // The form renders only one auth method at a time, so the issue is
    // addressed to both fields — whichever is mounted will display it.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Either Service Account or OAuth connection must be provided',
      path: ['serviceAccount'],
    });
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Connect your Google account or provide a Service Account to save',
      path: ['credentialId'],
    });
  });
