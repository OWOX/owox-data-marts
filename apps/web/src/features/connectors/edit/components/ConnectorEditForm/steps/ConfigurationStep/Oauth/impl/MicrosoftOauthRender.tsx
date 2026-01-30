import type { OauthRenderComponentProps } from '../OauthRenderFactory';
import {
  MicrosoftLoginButton,
  type MicrosoftLoginResponse,
} from '../../../../../../../shared/components/MicrosoftLoginButton';

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

  return (
    <div className='mt-2 mb-2'>
      <MicrosoftLoginButton
        clientId={settings?.vars.ClientId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        onSuccess={handleMicrosoftLogin}
        disabled={isLoading}
      >
        {status?.user ? (
          <>
            Connected as <strong>{status.user.name ?? status.user.id}</strong>
          </>
        ) : (
          'Sign in with Microsoft'
        )}
      </MicrosoftLoginButton>
    </div>
  );
}
