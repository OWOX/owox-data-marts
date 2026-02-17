/**
 * Error for authentication flow failures with context.
 */
export class AuthenticationException extends Error {
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(message: string, opts?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(message);
    this.name = 'AuthenticationException';
    this.cause = opts?.cause;
    this.context = opts?.context;
  }
}

/**
 * Error for forbidden/blocked identities (HTTP 403).
 */
export class ForbiddenException extends Error {
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(message: string, opts?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(message);
    this.name = 'ForbiddenException';
    this.cause = opts?.cause;
    this.context = opts?.context;
  }
}

const STATE_EXPIRED_ERROR_MARKER = 'state expired';

/**
 * Detects "state expired" errors by a consistent marker.
 */
export function isStateExpiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.toLowerCase().includes(STATE_EXPIRED_ERROR_MARKER);
}

/**
 * Error for failed requests to Identity OWOX.
 */
export class IdpFailedException extends Error {
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;

  constructor(message: string, opts?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(message);
    this.name = 'IdpRequestFailedException';
    this.cause = opts?.cause;
    this.context = opts?.context;
  }
}
