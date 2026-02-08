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
