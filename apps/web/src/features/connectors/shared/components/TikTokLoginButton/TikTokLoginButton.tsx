import { Button } from '@owox/ui/components/button';
import { useOAuthPopup } from '../../hooks/useOAuthPopup';

interface TikTokLoginButtonProps {
  appId: string;
  redirectUri: string;
  onSuccess: (response: TikTokLoginResponse) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export interface TikTokLoginResponse {
  authCode: string;
}

export type TikTokAuthMessage =
  | { type: 'TIKTOK_AUTH_SUCCESS'; authCode: string; state: string | null }
  | { type: 'TIKTOK_AUTH_ERROR'; error: string };

const TIKTOK_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';

function isTikTokAuthMessage(data: unknown): data is TikTokAuthMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;

  if (msg.type === 'TIKTOK_AUTH_SUCCESS') {
    return typeof msg.authCode === 'string';
  }

  if (msg.type === 'TIKTOK_AUTH_ERROR') {
    return typeof msg.error === 'string';
  }

  return false;
}

export function TikTokLoginButton({
  appId,
  redirectUri,
  onSuccess,
  onError,
  disabled = false,
  children,
}: TikTokLoginButtonProps) {
  const { openPopup, isLoading, error } = useOAuthPopup<TikTokLoginResponse, TikTokAuthMessage>({
    redirectUri,
    buildAuthUrl: (state: string) => {
      const url = new URL(TIKTOK_AUTH_URL);
      url.searchParams.set('app_id', appId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      return url.toString();
    },
    onSuccess,
    onError,
    isAuthMessage: isTikTokAuthMessage,
    getSuccessResponse: (msg: TikTokAuthMessage) => {
      if (msg.type === 'TIKTOK_AUTH_SUCCESS') {
        return { authCode: msg.authCode };
      }
      throw new Error('Invalid response');
    },
    getErrorMessage: (msg: TikTokAuthMessage) => {
      if (msg.type === 'TIKTOK_AUTH_ERROR') {
        return msg.error;
      }
      return 'Unknown error';
    },
  });

  const handleLogin = () => {
    if (!appId || !redirectUri) {
      onError?.(new Error('TikTok OAuth configuration is incomplete'));
      return;
    }
    openPopup();
  };

  const isDisabled = disabled || isLoading || !appId || !redirectUri;

  const getButtonContent = () => {
    if (isLoading) {
      return 'Connecting...';
    }
    if (children) {
      return children;
    }
    if (!appId || !redirectUri) {
      return 'OAuth not configured';
    }
    return 'Continue with TikTok';
  };

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        onClick={handleLogin}
        disabled={isDisabled}
        className='flex items-center justify-center gap-2 rounded-md border-none bg-[#000000] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1a1a1a] disabled:cursor-not-allowed disabled:opacity-60'
      >
        <svg width={20} height={20} viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
          <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z' />
        </svg>
        {getButtonContent()}
      </Button>

      {error && <div className='mt-1 text-xs text-red-600'>{error}</div>}
    </div>
  );
}
