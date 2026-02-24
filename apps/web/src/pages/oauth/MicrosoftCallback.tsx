import { useOAuthCallback } from '../../features/connectors/shared/hooks/useOAuthCallback';
import { OAuthCallbackUI } from '../../features/connectors/shared/components/OAuthCallbackUI';

/**
 * OAuth callback page for Microsoft authentication.
 * This page handles the redirect from Microsoft OAuth flow,
 * extracts the authorization code, and passes it back to the opener window.
 */
export function MicrosoftCallback() {
  const { status, errorMessage } = useOAuthCallback({
    providerName: 'Microsoft',
    successType: 'MICROSOFT_AUTH_SUCCESS',
    errorType: 'MICROSOFT_AUTH_ERROR',
    getSuccessPayload: searchParams => ({
      code: searchParams.get('code') ?? '',
    }),
    hasSuccessData: searchParams => !!searchParams.get('code'),
  });

  return <OAuthCallbackUI status={status} errorMessage={errorMessage} />;
}
