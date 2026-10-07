import { z } from 'zod';
import { COPY_SOURCE_CREDENTIAL_PLACEHOLDER } from '../utils/credential-identity-utils';

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
    // While credentials are copied from another entity the key field is hidden and never sent,
    // so whatever was typed into it before must not block the save.
    const copyingCredentials = data.credentialId === COPY_SOURCE_CREDENTIAL_PLACEHOLDER;

    if (serviceAccount && !copyingCredentials) {
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
