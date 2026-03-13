import { useOAuthCallback } from '../../features/connectors/shared/hooks/useOAuthCallback';
import { OAuthCallbackUI } from '../../features/connectors/shared/components/OAuthCallbackUI';

/**
 * OAuth callback page for Google Ads authentication.
 * This page handles the redirect from Google OAuth flow,
 * extracts the authorization code, and passes it back to the opener window.
 */
export function GoogleAdsCallback() {
  const { status, errorMessage } = useOAuthCallback({
    providerName: 'GoogleAds',
    successType: 'GOOGLE_ADS_AUTH_SUCCESS',
    errorType: 'GOOGLE_ADS_AUTH_ERROR',
    getSuccessPayload: searchParams => ({
      code: searchParams.get('code') ?? '',
    }),
    hasSuccessData: searchParams => !!searchParams.get('code'),
  });

  return <OAuthCallbackUI status={status} errorMessage={errorMessage} />;
}
