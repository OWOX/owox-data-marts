import { GoogleAdsLoginButton } from '../../../../../../../shared/components/GoogleAdsLoginButton';
import type { GoogleAdsLoginResponse } from '../../../../../../../shared/components/GoogleAdsLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';

export function GoogleAdsOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
  connectorName,
}: OauthRenderComponentProps) {
  const handleGoogleAdsLogin = (response: GoogleAdsLoginResponse) => {
    void onOAuthSuccess({ code: response.code });
  };

  const isGoogleSheets = connectorName === 'GoogleSheets';

  return (
    <div className='mt-2 mb-2 space-y-4'>
      <GoogleAdsLoginButton
        clientId={settings?.vars.ClientId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        scope={
          isGoogleSheets
            ? 'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/userinfo.email'
            : undefined
        }
        serviceName={isGoogleSheets ? 'Google Sheets' : 'Google Ads'}
        successMessageType={isGoogleSheets ? 'GOOGLE_SHEETS_AUTH_SUCCESS' : undefined}
        errorMessageType={isGoogleSheets ? 'GOOGLE_SHEETS_AUTH_ERROR' : undefined}
        onSuccess={handleGoogleAdsLogin}
        disabled={isLoading}
      >
        {status?.user ? (
          <>
            Connected as <strong>{status.user.name ?? status.user.id}</strong>
          </>
        ) : (
          'Sign in with Google'
        )}
      </GoogleAdsLoginButton>
    </div>
  );
}
