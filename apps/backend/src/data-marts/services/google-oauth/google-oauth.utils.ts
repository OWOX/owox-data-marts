import { OAuth2Client } from 'google-auth-library';
import type { GoogleOAuthClientConfig } from './google-oauth-config.service';

interface GoogleTokenRefreshError {
  message?: unknown;
  response?: {
    data?: {
      error?: unknown;
      error_description?: unknown;
    };
  };
}

/** True when Google refused a refresh because the grant is gone, not because of a transient failure. */
export function isInvalidRefreshTokenError(error: unknown): boolean {
  const tokenError = error as GoogleTokenRefreshError;
  const googleError = tokenError.response?.data?.error;
  const googleErrorDescription = tokenError.response?.data?.error_description;

  return (
    googleError === 'invalid_grant' ||
    (typeof googleErrorDescription === 'string' &&
      googleErrorDescription.includes('invalid_grant')) ||
    (error instanceof Error && error.message.includes('invalid_grant'))
  );
}

export function newGoogleOAuthClient(
  client: GoogleOAuthClientConfig,
  redirectUri: string
): OAuth2Client {
  return new OAuth2Client(client.clientId, client.clientSecret, redirectUri);
}
