/**
 * Identifies the `AuthenticationException` thrown by `@owox/idp-owox-better-auth`
 * when an upstream token exchange fails with 401 (e.g. an expired or invalid
 * MCP refresh token).
 *
 * The primary signal is the class name, so callers do not need a runtime
 * import from that ESM-only package (keeps ts-jest happy in unit and e2e
 * suites). We also accept any `Error` that carries a `status === 401` —
 * subclassing or transport repackaging that drops the original `name` would
 * otherwise hide an upstream 401 behind a generic 500.
 */
export function isAuthenticationError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  if (err.name === 'AuthenticationException') return true;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' && status === 401;
}
