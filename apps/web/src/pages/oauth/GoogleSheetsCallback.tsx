import { useOAuthCallback } from '../../features/connectors/shared/hooks/useOAuthCallback';
import { OAuthCallbackUI } from '../../features/connectors/shared/components/OAuthCallbackUI';

export function GoogleSheetsCallback() {
  const { status, errorMessage } = useOAuthCallback({
    providerName: 'GoogleSheets',
    successType: 'GOOGLE_SHEETS_AUTH_SUCCESS',
    errorType: 'GOOGLE_SHEETS_AUTH_ERROR',
    getSuccessPayload: searchParams => ({
      code: searchParams.get('code') ?? '',
    }),
    hasSuccessData: searchParams => !!searchParams.get('code'),
  });

  return <OAuthCallbackUI status={status} errorMessage={errorMessage} />;
}
