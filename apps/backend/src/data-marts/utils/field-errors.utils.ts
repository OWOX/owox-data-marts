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
  return error.issues.map(issue => ({
    field: [scope, ...issue.path].join('.'),
    message: issueMessage(issue),
  }));
}

/**
 * The raw issues, for the API consumers that read `errorDetails.errors`, with every copy of the
 * submitted value removed: `input` (present when a parse reports it), and the same inside a
 * union's nested issues. A credential typed into the wrong field must not come back in the
 * response body any more than in the message.
 */
export function sanitizeIssues(issues: readonly ZodIssue[]): Record<string, unknown>[] {
  return issues.map(issue => {
    const { input: _input, ...raw } = issue;
    const rest = { ...raw, message: issueMessage(issue) };
    if (issue.code === 'invalid_union') {
      return { ...rest, errors: issue.errors.map(sanitizeIssues) };
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
  const details = error.issues
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
 * - Zod reports a missing key only by its type (`expected string, received undefined`). Several
 *   keys of one pasted key file land on the same input, where such a row names nothing — so name
 *   the key.
 * - An enum mismatch names the allowed values with the key it rejected, never the submitted value:
 *   a credential value must never be echoed back into a toast.
 */
function issueMessage(issue: ZodIssue): string {
  const key = issue.path.at(-1);
  if (
    issue.code === 'invalid_type' &&
    issue.message.endsWith('received undefined') &&
    key !== undefined
  ) {
    return `${String(key)} is required`;
  }
  if (issue.code === 'invalid_value') {
    const allowed = issue.values.map(value => `'${String(value)}'`).join(' | ');
    return key !== undefined ? `${String(key)} must be one of ${allowed}` : `Expected ${allowed}`;
  }
  return issue.message;
}
