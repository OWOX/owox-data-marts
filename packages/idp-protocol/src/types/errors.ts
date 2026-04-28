/**
 * Base error class for the IDP protocol
 */
export interface HttpError {
  getStatus(): number;
}

export class IdpError extends Error implements HttpError {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'IdpError';
  }

  getStatus(): number {
    return this.statusCode;
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends IdpError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends IdpError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

/**
 * Token expired error
 */
export class TokenExpiredError extends IdpError {
  constructor(message: string = 'Token has expired') {
    super(message, 'TOKEN_EXPIRED', 401);
  }
}

/**
 * Invalid token error
 */
export class InvalidTokenError extends IdpError {
  constructor(message: string = 'Invalid token') {
    super(message, 'INVALID_TOKEN', 401);
  }
}

/**
 * Raised when an IDP provider does not implement an optional operation
 * (e.g. the Null provider is asked to invite a user). Maps to HTTP 501.
 */
export class IdpOperationNotSupportedError extends IdpError {
  constructor(operation: string) {
    super(`IDP operation not supported: ${operation}`, 'OPERATION_NOT_SUPPORTED', 501);
    this.name = 'IdpOperationNotSupportedError';
  }
}
