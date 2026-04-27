/**
 * Identifies the `IdpNotFoundException` thrown by `@owox/idp-owox-better-auth`.
 *
 * The primary signal is the class name, so callers do not need a runtime
 * import from that ESM-only package (keeps ts-jest happy in unit and e2e
 * suites). We also accept any `Error` that carries a `status === 404` —
 * subclassing or transport repackaging that drops the original `name` would
 * otherwise hide an upstream 404 behind a generic 500.
 */
export function isIdpNotFoundError(err: unknown): err is Error {
  if (!(err instanceof Error)) return false;
  if (err.name === 'IdpNotFoundException') return true;
  const status = (err as { status?: unknown }).status;
  return typeof status === 'number' && status === 404;
}
