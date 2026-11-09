import { CircleCheck } from 'lucide-react';
import { useState } from 'react';
import { MicrosoftLoginButton } from '../../../../../../../shared/components/MicrosoftLoginButton';
import type { MicrosoftLoginResponse } from '../../../../../../../shared/components/MicrosoftLoginButton';
import { GoogleOAuthButton } from '../../../../../../../../google-oauth';
import {
  GoogleOAuthPopupClosedError,
  openGoogleOAuthPopup,
} from '../../../../../../../../google-oauth/utils/open-google-oauth-popup';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';

/** Google's consent screen for users who sign in to Microsoft Advertising with Google. */
function googleAuthorizationUrl(clientId: string, redirectUri: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // Microsoft Advertising only needs to know who signed in.
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: crypto.randomUUID(),
  }).toString();
  return url.toString();
}

export function MicrosoftOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
}: Pick<OauthRenderComponentProps, 'isLoading' | 'status' | 'settings' | 'onOAuthSuccess'>) {
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const handleMicrosoftLogin = (response: MicrosoftLoginResponse) => {
    void onOAuthSuccess({
      code: response.code,
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

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      const { code } = await openGoogleOAuthPopup(
        googleAuthorizationUrl(googleClient.clientId, googleClient.redirectUri)
      );
      await onOAuthSuccess({ code, identityProvider: 'google' });
    } catch (caught) {
      if (caught instanceof GoogleOAuthPopupClosedError) return;
      setGoogleError(caught instanceof Error ? caught.message : 'Google sign-in failed');
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className='mt-2 mb-2 space-y-2'>
      {connectedAs && (
        <p className='flex items-center gap-2 text-sm'>
          {status?.valid && <CircleCheck className='h-4 w-4 text-green-600' aria-hidden='true' />}
          <span>{connectedAs}</span>
        </p>
      )}
      <MicrosoftLoginButton
        clientId={settings?.vars.ClientId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        onSuccess={handleMicrosoftLogin}
        disabled={isLoading}
      >
        Sign in with Microsoft
      </MicrosoftLoginButton>
      <GoogleOAuthButton
        busy={googleBusy}
        disabled={isLoading || googleBusy}
        onClick={() => {
          void signInWithGoogle();
        }}
      >
        Sign in with Google
      </GoogleOAuthButton>
      {googleError && <div className='text-xs text-red-600'>{googleError}</div>}
    </div>
  );
}
