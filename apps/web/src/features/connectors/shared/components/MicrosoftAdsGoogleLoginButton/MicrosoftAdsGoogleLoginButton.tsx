import { Button } from '@owox/ui/components/button';
import { GoogleIcon } from '../../../../../shared/icons';
import { useOAuthPopup } from '../../hooks/useOAuthPopup';

interface MicrosoftAdsGoogleLoginButtonProps {
  clientId: string;
  redirectUri: string;
  onSuccess: (response: MicrosoftAdsGoogleLoginResponse) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export interface MicrosoftAdsGoogleLoginResponse {
  code: string;
}

type MicrosoftAdsGoogleAuthMessage =
  | { type: 'MICROSOFT_ADS_GOOGLE_AUTH_SUCCESS'; code: string; state: string | null }
  | { type: 'MICROSOFT_ADS_GOOGLE_AUTH_ERROR'; error: string };

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// Microsoft Advertising only needs to know who signed in.
const SCOPE = 'openid email profile';

function isMicrosoftAdsGoogleAuthMessage(data: unknown): data is MicrosoftAdsGoogleAuthMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;

  if (msg.type === 'MICROSOFT_ADS_GOOGLE_AUTH_SUCCESS') {
    return typeof msg.code === 'string';
  }

  if (msg.type === 'MICROSOFT_ADS_GOOGLE_AUTH_ERROR') {
    return typeof msg.error === 'string';
  }

  return false;
}

/**
 * Google sign-in for the Microsoft Ads source, for users who sign in to Microsoft
 * Advertising with Google.
 */
export function MicrosoftAdsGoogleLoginButton({
  clientId,
  redirectUri,
  onSuccess,
  onError,
  disabled = false,
  children,
}: MicrosoftAdsGoogleLoginButtonProps) {
  const { openPopup, isLoading, error } = useOAuthPopup<
    MicrosoftAdsGoogleLoginResponse,
    MicrosoftAdsGoogleAuthMessage
  >({
    redirectUri,
    buildAuthUrl: (state: string) => {
      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('scope', SCOPE);
      url.searchParams.set('state', state);
      url.searchParams.set('access_type', 'offline');
      url.searchParams.set('prompt', 'consent');
      return url.toString();
    },
    onSuccess,
    onError,
    isAuthMessage: isMicrosoftAdsGoogleAuthMessage,
    getSuccessResponse: (msg: MicrosoftAdsGoogleAuthMessage) => {
      if (msg.type === 'MICROSOFT_ADS_GOOGLE_AUTH_SUCCESS') {
        return { code: msg.code };
      }
      throw new Error('Invalid response');
    },
    getErrorMessage: (msg: MicrosoftAdsGoogleAuthMessage) => {
      if (msg.type === 'MICROSOFT_ADS_GOOGLE_AUTH_ERROR') {
        return msg.error;
      }
      return 'Unknown error';
    },
  });

  const handleLogin = () => {
    if (!clientId || !redirectUri) {
      onError?.(new Error('Google OAuth configuration is incomplete'));
      return;
    }
    openPopup();
  };

  const isDisabled = disabled || isLoading || !clientId || !redirectUri;

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        onClick={handleLogin}
        disabled={isDisabled}
        className='flex items-center justify-center gap-2 rounded-md border border-[#DADCE0] bg-white px-4 py-2.5 text-sm font-semibold text-[#3C4043] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-60'
      >
        <GoogleIcon className='h-5 w-5 shrink-0' />
        {isLoading ? 'Connecting...' : (children ?? 'Sign in with Google')}
      </Button>

      {error && <div className='mt-1 text-xs text-red-600'>{error}</div>}
    </div>
  );
}
