export interface ProviderErrorIdentity {
  code?: unknown;
  errorCode?: unknown;
  reason?: unknown;
}

/**
 * Adds local context without hiding the provider identity used by downstream
 * error classification. The original provider error remains available as the
 * standard Error cause for diagnostics.
 */
export function wrapProviderError(message: string, error: unknown): Error & ProviderErrorIdentity {
  const wrapped = new Error(message, { cause: error }) as Error & ProviderErrorIdentity;
  if (typeof error !== 'object' || error === null) return wrapped;

  const identity = error as ProviderErrorIdentity;
  if (identity.code !== undefined) wrapped.code = identity.code;
  if (identity.errorCode !== undefined) wrapped.errorCode = identity.errorCode;
  if (identity.reason !== undefined) wrapped.reason = identity.reason;
  return wrapped;
}
