import { LinkedInLoginButton } from '../../../../../../../shared/components/LinkedInLoginButton/LinkedInLoginButton';
import type { LinkedInLoginResponse } from '../../../../../../../shared/components/LinkedInLoginButton/LinkedInLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';

export function LinkedInOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
}: Pick<OauthRenderComponentProps, 'isLoading' | 'status' | 'settings' | 'onOAuthSuccess'>) {
  const handleLinkedInLogin = (response: LinkedInLoginResponse) => {
    void onOAuthSuccess({
      code: response.code,
    });
  };

  return (
    <div className='mt-2 mb-2'>
      <LinkedInLoginButton
        clientId={settings?.vars.ClientId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        scope={(settings?.vars.Scopes as string) || ''}
        onSuccess={handleLinkedInLogin}
        disabled={isLoading}
      >
        {status?.user ? (
          <>
            Connected as <strong>{status.user.name ?? status.user.id}</strong>
          </>
        ) : (
          'Continue with LinkedIn'
        )}
      </LinkedInLoginButton>
    </div>
  );
}
