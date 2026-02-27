import { HttpException, HttpStatus, Logger } from '@nestjs/common';

export class GoogleOAuthException extends HttpException {
  private static readonly logger = new Logger('GoogleOAuthException');

  /** Internal details for logging only — never sent to the client. */
  public readonly internalDetails?: unknown;

  constructor(
    message: string,
    public readonly code: string,
    statusCode: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR,
    details?: unknown
  ) {
    super(
      {
        statusCode,
        code,
        message,
        timestamp: new Date().toISOString(),
      },
      statusCode
    );
    this.name = 'GoogleOAuthException';
    this.internalDetails = details;

    if (details) {
      GoogleOAuthException.logger.error(
        `[${code}] ${message}`,
        details instanceof Error ? details.stack : details
      );
    }
  }
}

export class OAuthNotConfiguredException extends GoogleOAuthException {
  constructor(details?: unknown) {
    super(
      'Google OAuth is not configured. Please set GOOGLE_OAUTH_STORAGE_CLIENT_ID/SECRET and/or GOOGLE_OAUTH_DESTINATION_CLIENT_ID/SECRET, plus GOOGLE_OAUTH_REDIRECT_URI and GOOGLE_OAUTH_JWT_SECRET.',
      'OAUTH_NOT_CONFIGURED',
      HttpStatus.SERVICE_UNAVAILABLE,
      details
    );
    this.name = 'OAuthNotConfiguredException';
  }
}

export class InvalidOAuthStateException extends GoogleOAuthException {
  constructor(details?: unknown) {
    super(
      'Invalid or expired OAuth state token. Please restart the OAuth flow.',
      'INVALID_OAUTH_STATE',
      HttpStatus.BAD_REQUEST,
      details
    );
    this.name = 'InvalidOAuthStateException';
  }
}

export class TokenExchangeFailedException extends GoogleOAuthException {
  constructor(
    message: string = 'Failed to exchange authorization code for tokens',
    details?: unknown
  ) {
    super(message, 'TOKEN_EXCHANGE_FAILED', HttpStatus.BAD_REQUEST, details);
    this.name = 'TokenExchangeFailedException';
  }
}

export class TokenRefreshFailedException extends GoogleOAuthException {
  constructor(message: string = 'Failed to refresh OAuth tokens', details?: unknown) {
    super(message, 'TOKEN_REFRESH_FAILED', HttpStatus.INTERNAL_SERVER_ERROR, details);
    this.name = 'TokenRefreshFailedException';
  }
}

export class CredentialsNotFoundException extends GoogleOAuthException {
  constructor(entityId: string, entityType: 'storage' | 'destination') {
    super(
      `OAuth credentials not found for ${entityType} ID: ${entityId}`,
      'CREDENTIALS_NOT_FOUND',
      HttpStatus.NOT_FOUND,
      { entityId, entityType }
    );
    this.name = 'CredentialsNotFoundException';
  }
}

export class CredentialsExpiredException extends GoogleOAuthException {
  constructor(entityId: string, entityType: 'storage' | 'destination') {
    super(
      `OAuth credentials expired for ${entityType} ID: ${entityId}. Please re-authorize.`,
      'CREDENTIALS_EXPIRED',
      HttpStatus.UNAUTHORIZED,
      { entityId, entityType }
    );
    this.name = 'CredentialsExpiredException';
  }
}

export class UnauthorizedOAuthAccessException extends GoogleOAuthException {
  constructor(entityId: string, entityType: 'storage' | 'destination') {
    super(
      `Unauthorized access to ${entityType} ID: ${entityId}. Entity does not belong to your project.`,
      'UNAUTHORIZED_OAUTH_ACCESS',
      HttpStatus.FORBIDDEN,
      { entityId, entityType }
    );
    this.name = 'UnauthorizedOAuthAccessException';
  }
}

export class GoogleApiException extends GoogleOAuthException {
  constructor(message: string, details?: unknown) {
    super(message, 'GOOGLE_API_ERROR', HttpStatus.BAD_GATEWAY, details);
    this.name = 'GoogleApiException';
  }
}
