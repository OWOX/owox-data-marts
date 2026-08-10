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
