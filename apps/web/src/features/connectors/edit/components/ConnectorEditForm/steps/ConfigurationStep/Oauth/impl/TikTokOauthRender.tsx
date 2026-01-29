import { TikTokLoginButton } from '../../../../../../../shared/components/TikTokLoginButton';
import type { TikTokLoginResponse } from '../../../../../../../shared/components/TikTokLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';

export function TikTokOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
}: Pick<OauthRenderComponentProps, 'isLoading' | 'status' | 'settings' | 'onOAuthSuccess'>) {
  const handleTikTokLogin = (response: TikTokLoginResponse) => {
    void onOAuthSuccess({
      authCode: response.authCode,
    });
  };

  return (
    <div className='mt-2 mb-2'>
      <TikTokLoginButton
        appId={settings?.vars.AppId as string}
        redirectUri={settings?.vars.RedirectUri as string}
        onSuccess={handleTikTokLogin}
        disabled={isLoading}
      >
        {status?.user ? (
          <>
            Authenticated as <strong>{status.user.name ?? status.user.id}</strong>
          </>
        ) : (
          'Continue with TikTok'
        )}
      </TikTokLoginButton>
    </div>
  );
}
