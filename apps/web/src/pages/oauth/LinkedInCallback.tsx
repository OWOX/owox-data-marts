import { useOAuthCallback } from '../../features/connectors/shared/hooks/useOAuthCallback';
import { OAuthCallbackUI } from '../../features/connectors/shared/components/OAuthCallbackUI';

/**
 * OAuth callback page for LinkedIn authentication.
 * This page handles the redirect from LinkedIn OAuth flow,
 * extracts the authorization code, and passes it back to the opener window.
 */
export function LinkedInCallback() {
  const { status, errorMessage } = useOAuthCallback({
    providerName: 'LinkedIn',
    successType: 'LINKEDIN_AUTH_SUCCESS',
    errorType: 'LINKEDIN_AUTH_ERROR',
    getSuccessPayload: searchParams => ({
      code: searchParams.get('code') ?? '',
    }),
    hasSuccessData: searchParams => !!searchParams.get('code'),
  });

  return <OAuthCallbackUI status={status} errorMessage={errorMessage} />;
}
