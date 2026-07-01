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
      const logPayload = details instanceof Error ? details.stack : details;
      if (statusCode >= 500) {
        GoogleOAuthException.logger.error(`[${code}] ${message}`, logPayload);
      } else {
        GoogleOAuthException.logger.warn(`[${code}] ${message}`, logPayload);
      }
    }
  }
}

export class OAuthNotConfiguredException extends GoogleOAuthException {
  constructor(details?: unknown) {
    super(
      'Google OAuth is not configured. Please set OAUTH_GOOGLE_STORAGE_CLIENT_ID/SECRET and/or OAUTH_GOOGLE_DESTINATION_CLIENT_ID/SECRET, plus OAUTH_GOOGLE_REDIRECT_URI and OAUTH_GOOGLE_JWT_SECRET.',
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
  constructor(
    message: string = 'Google access could not be refreshed. Please try again later.',
    details?: unknown
  ) {
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
  constructor(entityId: string, entityType: 'storage' | 'destination', details?: unknown) {
    const resourceLabel = entityType === 'storage' ? 'Storage' : 'Destination';
    super(
      `Google authorization could not be refreshed. Reconnect this ${resourceLabel} to restore access.`,
      'CREDENTIALS_EXPIRED',
      HttpStatus.UNAUTHORIZED,
      details ? { entityId, entityType, details } : { entityId, entityType }
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

/**
 * Raised when a document auto-creation is attempted on a destination that has
 * no connected Google OAuth account. The frontend keys off the `code` to show a
 * "Connect Google account" CTA.
 */
export class OAuthNotConnectedException extends GoogleOAuthException {
  constructor(destinationId: string) {
    super(
      'Google account is not connected for this destination. Connect a Google account to create documents.',
      'OAUTH_NOT_CONNECTED',
      HttpStatus.BAD_REQUEST,
      { destinationId }
    );
    this.name = 'OAuthNotConnectedException';
  }
}

/**
 * Raised when document auto-creation is attempted on a Service Account
 * destination that has no Drive folder configured. SA-based creation must place
 * the file in a shared Drive folder (an SA file in My Drive would be invisible),
 * so a folder is required.
 */
export class ServiceAccountRequiresFolderException extends GoogleOAuthException {
  constructor(destinationId: string) {
    super(
      'This Service Account destination has no Drive folder configured. Set a Shared Drive folder ID on the destination and share it with the service account (Content Manager) to auto-create documents.',
      'SA_REQUIRES_FOLDER',
      HttpStatus.BAD_REQUEST,
      { destinationId }
    );
    this.name = 'ServiceAccountRequiresFolderException';
  }
}

/**
 * Raised at destination save time when the configured Drive folder is not usable
 * for service-account auto-creation (missing, not a folder, not in a Shared
 * Drive, or not shared with the service account). Surfaced to the user so they
 * can fix the folder before saving.
 */
export class DestinationFolderAccessException extends GoogleOAuthException {
  constructor(message: string, details?: unknown) {
    super(message, 'DESTINATION_FOLDER_ACCESS', HttpStatus.BAD_REQUEST, details);
    this.name = 'DestinationFolderAccessException';
  }
}

/**
 * Raised when creating a Google Sheet inside the configured Drive folder fails
 * (e.g. the folder is not a Shared Drive, or is not shared with the service
 * account). The underlying error is logged (not sent to the client).
 */
export class SheetFolderCreateFailedException extends GoogleOAuthException {
  /**
   * @param hint - path-specific remediation appended to the message. The OAuth
   *   and Service Account paths fail for different reasons, so the caller passes
   *   the guidance that actually applies (no "service account" advice for OAuth).
   */
  constructor(destinationId: string, details?: unknown, hint?: string) {
    super(
      `Failed to create the Google Sheet in the configured Drive folder.${hint ? ` ${hint}` : ''}`,
      'SHEET_FOLDER_CREATE_FAILED',
      HttpStatus.BAD_REQUEST,
      details ?? { destinationId }
    );
    this.name = 'SheetFolderCreateFailedException';
  }
}
