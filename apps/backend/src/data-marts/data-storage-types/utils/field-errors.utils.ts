import { ZodError, ZodIssue } from 'zod';

/**
 * One rejected value the client can point at. `field` is the dot path of that value in the
 * storage update request body (`config.projectId`, `credentials.private_key`), so a form can
 * highlight the input that holds it instead of leaving the user to guess from a toast.
 */
export interface FieldError {
  field: string;
  message: string;
}

export type FieldErrorScope = 'config' | 'credentials';

export function toFieldErrors(scope: FieldErrorScope, error: ZodError): FieldError[] {
  return error.errors.map(issue => ({
    field: [scope, ...issue.path].join('.'),
    message: namedMessage(issue),
  }));
}

/**
 * Zod reports a missing key as a bare `Required`. Several keys of one pasted key file land on
 * the same form input, where a row of `Required` names nothing — so name the key instead.
 */
function namedMessage(issue: ZodIssue): string {
  const key = issue.path.at(-1);
  if (issue.code === 'invalid_type' && issue.message === 'Required' && key !== undefined) {
    return `${key} is required`;
  }
  return issue.message;
}

/**
 * `Invalid config — projectId: <reason>; location: <reason>` — names every rejected value in the
 * message itself, for the clients that only ever show `message`. The storage schemas' messages
 * describe the rule (`private_key must be a valid PEM format private key`), not the submitted
 * value, so this does not echo a secret back.
 */
export function describeInvalidInput(scope: FieldErrorScope, error: ZodError): string {
  const label = scope === 'config' ? 'Invalid config' : 'Invalid credentials';
  const details = error.errors
    .map(issue => `${issue.path.join('.') || scope}: ${issue.message}`)
    .join('; ');
  return details ? `${label} — ${details}` : label;
}
