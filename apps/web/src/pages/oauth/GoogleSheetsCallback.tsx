import { useOAuthCallback } from '../../features/connectors/shared/hooks/useOAuthCallback';
import { OAuthCallbackUI } from '../../features/connectors/shared/components/OAuthCallbackUI';

export function GoogleSheetsCallback() {
  const { status, errorMessage } = useOAuthCallback({
    providerName: 'GoogleSheets',
    successType: 'GOOGLE_SHEETS_AUTH_SUCCESS',
    errorType: 'GOOGLE_SHEETS_AUTH_ERROR',
    // response_type=code token: Google returns both in the fragment.
    fromFragment: true,
    getSuccessPayload: params => ({
      code: params.get('code') ?? '',
      accessToken: params.get('access_token') ?? '',
    }),
    // No token comes back to a page opened before the update; that page asks for the code only.
    hasSuccessData: params => !!params.get('code'),
  });

  return <OAuthCallbackUI status={status} errorMessage={errorMessage} />;
}
