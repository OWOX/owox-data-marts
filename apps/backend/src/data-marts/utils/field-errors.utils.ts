import { ZodError, ZodIssue } from 'zod';

/**
 * One rejected value the client can point at. `field` is the dot path of that value in the
 * Storage or Destination save request body (`config.projectId`, `credentials.private_key`), so a
 * form can highlight the input that holds it instead of leaving the user to guess from a toast.
 */
export interface FieldError {
  field: string;
  message: string;
}

export type FieldErrorScope = 'config' | 'credentials';

export function toFieldErrors(scope: FieldErrorScope, error: ZodError): FieldError[] {
  return error.errors.map(issue => ({
    field: [scope, ...issue.path].join('.'),
    message: issueMessage(issue),
  }));
}

/**
 * The raw issues, for the API consumers that read `errorDetails.errors`, with every copy of the
 * submitted value removed: `received` (an enum or literal mismatch carries the value itself), the
 * enum message that quotes it, and the same inside a union's nested issues. A credential typed into the wrong field must not come
 * back in the response body any more than in the message.
 */
export function sanitizeIssues(issues: readonly ZodIssue[]): Record<string, unknown>[] {
  return issues.map(issue => {
    const { received: _received, ...raw } = issue as ZodIssue & { received?: unknown };
    // Zod's own wording of an enum mismatch quotes the value too.
    const rest = { ...raw, message: issueMessage(issue) };
    if (issue.code === 'invalid_union') {
      return {
        ...rest,
        unionErrors: issue.unionErrors.map(unionError => ({
          issues: sanitizeIssues(unionError.issues),
        })),
      };
    }
    return rest;
  });
}

/**
 * `Invalid config — projectId: <reason>` or `Invalid credentials — project_id is required` —
 * names every rejected value in the message itself, for the clients that only ever show
 * `message`. The key is not repeated when the reason already names it.
 */
export function describeInvalidInput(scope: FieldErrorScope, error: ZodError): string {
  const label = scope === 'config' ? 'Invalid config' : 'Invalid credentials';
  const details = error.errors
    .map(issue => {
      const message = issueMessage(issue);
      const key = issue.path.at(-1);
      if (key !== undefined && message.includes(String(key))) return message;
      return `${issue.path.join('.') || scope}: ${message}`;
    })
    .join('; ');
  return details ? `${label} — ${details}` : label;
}

/**
 * The issue's message, made safe and specific enough to show next to a form input:
 * - Zod reports a missing key as a bare `Required`. Several keys of one pasted key file land on
 *   the same input, where a row of `Required` names nothing — so name the key.
 * - An enum mismatch is the one built-in message that quotes the submitted value
 *   (`received 'x'`). A credential value must never be echoed back into a toast, so list only
 *   the allowed values.
 */
function issueMessage(issue: ZodIssue): string {
  const key = issue.path.at(-1);
  if (issue.code === 'invalid_type' && issue.message === 'Required' && key !== undefined) {
    return `${key} is required`;
  }
  if (issue.code === 'invalid_enum_value') {
    const allowed = issue.options.map(option => `'${String(option)}'`).join(' | ');
    return key !== undefined ? `${key} must be one of ${allowed}` : `Expected ${allowed}`;
  }
  return issue.message;
}
