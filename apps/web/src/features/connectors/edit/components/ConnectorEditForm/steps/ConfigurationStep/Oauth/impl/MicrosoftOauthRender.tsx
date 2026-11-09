import { MicrosoftLoginButton } from '../../../../../../../shared/components/MicrosoftLoginButton';
import type { MicrosoftLoginResponse } from '../../../../../../../shared/components/MicrosoftLoginButton';
import { MicrosoftAdsGoogleLoginButton } from '../../../../../../../shared/components/MicrosoftAdsGoogleLoginButton';
import type { MicrosoftAdsGoogleLoginResponse } from '../../../../../../../shared/components/MicrosoftAdsGoogleLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';

export function MicrosoftOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
}: Pick<OauthRenderComponentProps, 'isLoading' | 'status' | 'settings' | 'onOAuthSuccess'>) {
  const handleMicrosoftLogin = (response: MicrosoftLoginResponse) => {
    void onOAuthSuccess({
      code: response.code,
    });
  };

  const handleGoogleLogin = (response: MicrosoftAdsGoogleLoginResponse) => {
    void onOAuthSuccess({
      code: response.code,
      identityProvider: 'google',
    });
  };

  // Users who sign in to Microsoft Advertising with Google need a Google sign-in here.
  const googleClientId = settings?.vars.GoogleClientId;
  const googleRedirectUri = settings?.vars.GoogleRedirectUri;
  const googleClient =
    typeof googleClientId === 'string' &&
    googleClientId !== '' &&
    typeof googleRedirectUri === 'string' &&
    googleRedirectUri !== ''
      ? { clientId: googleClientId, redirectUri: googleRedirectUri }
      : null;
  const connectedAs = status?.user ? (
    <>
      Connected as <strong>{status.user.name ?? status.user.id}</strong>
    </>
  ) : null;

  if (!googleClient) {
    return (
      <div className='mt-2 mb-2'>
        <MicrosoftLoginButton
          clientId={settings?.vars.ClientId as string}
          redirectUri={settings?.vars.RedirectUri as string}
          onSuccess={handleMicrosoftLogin}
          disabled={isLoading}
        >
          {connectedAs ?? 'Sign in with Microsoft'}
        </MicrosoftLoginButton>
      </div>
    );
  }

  return (
    <div className='mt-2 mb-2 space-y-2'>
      {connectedAs && <p className='text-sm'>{connectedAs}</p>}
      <MicrosoftLoginButton
        clientId={settings?.vars.ClientId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        onSuccess={handleMicrosoftLogin}
        disabled={isLoading}
      >
        Sign in with Microsoft
      </MicrosoftLoginButton>
      <MicrosoftAdsGoogleLoginButton
        clientId={googleClient.clientId}
        redirectUri={googleClient.redirectUri}
        onSuccess={handleGoogleLogin}
        disabled={isLoading}
      >
        Sign in with Google
      </MicrosoftAdsGoogleLoginButton>
    </div>
  );
}
