/**
 * Identifies the `AuthenticationException` thrown by `@owox/idp-owox-better-auth`
 * when an upstream token exchange fails with 401 (e.g. an expired or invalid
 * MCP refresh token).
 *
 * The class name is the contract so callers do not need a runtime import from
 * the ESM-only package (keeps ts-jest happy in unit and e2e suites). A plain
 * `status === 401` is intentionally insufficient: the IB C2C interceptor uses
 * the same status when it rejects the service identity, and that failure must
 * remain a server-side dependency error rather than become `invalid_grant`.
 */
export function isAuthenticationError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  return err.name === 'AuthenticationException';
}
