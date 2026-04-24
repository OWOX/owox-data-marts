/**
 * Common properties for exceptions.
 */
interface ExceptionOpts {
  cause?: unknown;
  context?: Record<string, unknown>;
  status?: number;
}

/**
 * Base class for exceptions with context.
 */
export class BaseException extends Error {
  readonly cause?: unknown;
  readonly context?: Record<string, unknown>;
  readonly status?: number;
  readonly publicMessage?: string;

  constructor(name: string, message: string, opts?: ExceptionOpts & { publicMessage?: string }) {
    super(message);
    this.name = name;
    this.cause = opts?.cause;
    this.context = opts?.context;
    this.status = opts?.status;
    this.publicMessage = opts?.publicMessage;
  }
}

/**
 * Error for authentication flow failures with context.
 */
export class AuthenticationException extends BaseException {
  readonly description?: string | null;

  constructor(message: string, opts?: ExceptionOpts & { description?: string | null }) {
    super('AuthenticationException', message, {
      status: 401,
      publicMessage: 'Invalid or expired token',
      ...opts,
    });
    this.description = opts?.description;
  }
}

/**
 * Error for forbidden/blocked identities (HTTP 403).
 */
export class ForbiddenException extends BaseException {
  constructor(message: string, opts?: ExceptionOpts) {
    super('ForbiddenException', message, {
      status: 403,
      publicMessage: 'Access forbidden',
      ...opts,
    });
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
export class IdpFailedException extends BaseException {
  constructor(message: string, opts?: ExceptionOpts) {
    super('IdpFailedException', message, {
      status: 500,
      publicMessage: 'Internal server error',
      ...opts,
    });
  }
}

/**
 * Error for session resolution and authentication failures.
 */
export class SessionException extends BaseException {
  constructor(message: string, opts?: ExceptionOpts) {
    super('SessionException', message, {
      status: 401,
      publicMessage: 'Authentication session error',
      ...opts,
    });
  }
}

/**
 * Error for Identity API 4xx responses with raw body in context.
 */
export class IdentityApiException extends BaseException {
  constructor(message: string, opts?: ExceptionOpts) {
    super('IdentityApiException', message, {
      status: opts?.status ?? 400,
      publicMessage: 'IDP request failed',
      ...opts,
    });
  }
}
