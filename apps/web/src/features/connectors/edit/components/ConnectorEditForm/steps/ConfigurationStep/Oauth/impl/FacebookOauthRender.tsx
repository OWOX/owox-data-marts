import { AppWizardStepLabel } from '@owox/ui/components/common/wizard';
import { FacebookLoginButton } from '../../../../../../../shared/components/FacebookLoginButton';
import type { FacebookLoginResponse } from '../../../../../../../shared/components/FacebookLoginButton';
import type { OauthRenderComponentProps } from '../OauthRenderFactory';

export function FacebookOauthRender({
  isLoading,
  status,
  settings,
  onOAuthSuccess,
}: Pick<OauthRenderComponentProps, 'isLoading' | 'status' | 'settings' | 'onOAuthSuccess'>) {
  const handleFacebookLogin = (response: FacebookLoginResponse) => {
    void onOAuthSuccess({
      accessToken: response.accessToken,
    });
  };

  return (
    <div className='mb-4'>
      <AppWizardStepLabel className='mb-2 justify-start'>
        Facebook Authentication
      </AppWizardStepLabel>
      <FacebookLoginButton
        appId={settings?.vars.AppId as string}
        scope={settings?.vars.Scopes as string}
        onSuccess={handleFacebookLogin}
        disabled={isLoading}
      >
        {status?.user ? (
          <>
            Authenticated as <strong>{status.user.name ?? status.user.id}</strong>
          </>
        ) : (
          'Continue with Facebook'
        )}
      </FacebookLoginButton>
    </div>
  );
}
