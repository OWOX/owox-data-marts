import { useOAuthCallback } from '../../features/connectors/shared/hooks/useOAuthCallback';
import { OAuthCallbackUI } from '../../features/connectors/shared/components/OAuthCallbackUI';

/**
 * OAuth callback page for TikTok authentication.
 * This page handles the redirect from TikTok OAuth flow,
 * extracts the authorization code, and passes it back to the opener window.
 */
export function TikTokCallback() {
  const { status, errorMessage } = useOAuthCallback({
    providerName: 'TikTok',
    successType: 'TIKTOK_AUTH_SUCCESS',
    errorType: 'TIKTOK_AUTH_ERROR',
    getSuccessPayload: searchParams => ({
      authCode: searchParams.get('auth_code') ?? '',
    }),
    hasSuccessData: searchParams => !!searchParams.get('auth_code'),
  });

  return <OAuthCallbackUI status={status} errorMessage={errorMessage} />;
}
