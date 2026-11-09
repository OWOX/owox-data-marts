import { useOAuthCallback } from '../../features/connectors/shared/hooks/useOAuthCallback';
import { OAuthCallbackUI } from '../../features/connectors/shared/components/OAuthCallbackUI';

/**
 * OAuth callback page for "Sign in with Google" on the Microsoft Ads source.
 * It extracts the authorization code and passes it back to the opener window.
 */
export function MicrosoftAdsGoogleCallback() {
  const { status, errorMessage } = useOAuthCallback({
    providerName: 'Google',
    successType: 'MICROSOFT_ADS_GOOGLE_AUTH_SUCCESS',
    errorType: 'MICROSOFT_ADS_GOOGLE_AUTH_ERROR',
    getSuccessPayload: searchParams => ({
      code: searchParams.get('code') ?? '',
    }),
    hasSuccessData: searchParams => !!searchParams.get('code'),
  });

  return <OAuthCallbackUI status={status} errorMessage={errorMessage} />;
}
