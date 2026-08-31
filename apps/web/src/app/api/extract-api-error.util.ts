import type { ApiError } from './api-error.interface.ts';
import type { AxiosError } from 'axios';

/**
 * Null-safe at RUNTIME: callers pass whatever `catch` handed them, and a rejection that is not an
 * Axios error at all — or is `undefined`, which the 5xx toast passes deliberately — must fall back
 * to the caller's message rather than throw a TypeError inside the error handler.
 *
 * Returns an EMPTY object rather than `undefined` when there is nothing to extract, which is what
 * makes the non-optional return type honest: a dozen call sites read `.message` off this without
 * `?.`, so handing them `undefined` would throw inside the very handler meant to report a failure.
 * Their `?? fallback` then does what it already looks like it does.
 */
export const extractApiError = (error: unknown): ApiError => {
  return ((error as AxiosError | undefined)?.response?.data ?? {}) as ApiError;
};

/**
 * The message to show a user for a failed request: the server's own sentence when there is one,
 * the thrown error's message otherwise, and `fallback` when neither says anything.
 *
 * The middle step is what a bare `e instanceof Error ? e.message : fallback` gets you, and on an
 * Axios rejection that is only "Request failed with status code 400" — the refusal the backend
 * wrote for a human is in the body, not on the error. Reading the body first is what
 * `showApiErrorToast` already does for the toasts the interceptor raises; this is the same
 * precedence for the call sites that render the message themselves.
 */
export const apiErrorMessage = (error: unknown, fallback: string): string => {
  const serverMessage = extractApiError(error).message?.trim();
  if (serverMessage) return serverMessage;
  const thrownMessage = error instanceof Error ? error.message.trim() : '';
  return thrownMessage || fallback;
};
