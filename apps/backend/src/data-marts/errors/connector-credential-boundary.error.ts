/**
 * Raised when a stored credential is referenced from a configuration that does not own
 * it — a different project, or a different connector than the one it was issued for.
 *
 * This is a security boundary, not a transient failure. Callers that deliberately
 * tolerate credential errors (a refresh that could not reach the token endpoint, a
 * credential that has been deleted) must let this one through instead of continuing
 * with the foreign credential: swallowing it turns the boundary into a log line.
 *
 * Detection:
 *   if (error instanceof ConnectorCredentialBoundaryError) { throw error; }
 */
export class ConnectorCredentialBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectorCredentialBoundaryError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConnectorCredentialBoundaryError);
    }
  }
}
