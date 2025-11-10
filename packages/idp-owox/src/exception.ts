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
