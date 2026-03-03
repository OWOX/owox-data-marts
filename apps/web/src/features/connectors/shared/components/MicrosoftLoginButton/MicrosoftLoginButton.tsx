import { Button } from '@owox/ui/components/button';
import { useOAuthPopup } from '../../hooks/useOAuthPopup';

interface MicrosoftLoginButtonProps {
  clientId: string;
  redirectUri: string;
  onSuccess: (response: MicrosoftLoginResponse) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export interface MicrosoftLoginResponse {
  code: string;
}

type MicrosoftAuthMessage =
  | { type: 'MICROSOFT_AUTH_SUCCESS'; code: string; state: string | null }
  | { type: 'MICROSOFT_AUTH_ERROR'; error: string };

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const SCOPES = 'https://ads.microsoft.com/msads.manage offline_access';

function isMicrosoftAuthMessage(data: unknown): data is MicrosoftAuthMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;

  if (msg.type === 'MICROSOFT_AUTH_SUCCESS') {
    return typeof msg.code === 'string';
  }

  if (msg.type === 'MICROSOFT_AUTH_ERROR') {
    return typeof msg.error === 'string';
  }

  return false;
}

export function MicrosoftLoginButton({
  clientId,
  redirectUri,
  onSuccess,
  onError,
  disabled = false,
  children,
}: MicrosoftLoginButtonProps) {
  const { openPopup, isLoading, error } = useOAuthPopup<
    MicrosoftLoginResponse,
    MicrosoftAuthMessage
  >({
    redirectUri,
    buildAuthUrl: (state: string) => {
      const url = new URL(MICROSOFT_AUTH_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_mode', 'query');
      url.searchParams.set('scope', SCOPES);
      url.searchParams.set('state', state);
      url.searchParams.set('prompt', 'select_account');
      return url.toString();
    },
    onSuccess,
    onError,
    isAuthMessage: isMicrosoftAuthMessage,
    getSuccessResponse: (msg: MicrosoftAuthMessage) => {
      if (msg.type === 'MICROSOFT_AUTH_SUCCESS') {
        return { code: msg.code };
      }
      throw new Error('Invalid response');
    },
    getErrorMessage: (msg: MicrosoftAuthMessage) => {
      if (msg.type === 'MICROSOFT_AUTH_ERROR') {
        return msg.error;
      }
      return 'Unknown error';
    },
  });

  const handleLogin = () => {
    if (!clientId || !redirectUri) {
      onError?.(new Error('Microsoft OAuth configuration is incomplete'));
      return;
    }
    openPopup();
  };

  const isDisabled = disabled || isLoading || !clientId || !redirectUri;

  const getButtonContent = () => {
    if (isLoading) {
      return 'Connecting...';
    }
    if (children) {
      return children;
    }
    if (!clientId || !redirectUri) {
      return 'OAuth not configured';
    }
    return 'Sign in with Microsoft';
  };

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        onClick={handleLogin}
        disabled={isDisabled}
        className='flex items-center justify-center gap-2 rounded-md border border-[#8C8C8C] bg-white px-4 py-2.5 text-sm font-semibold text-[#5E5E5E] hover:bg-[#F3F2F1] disabled:cursor-not-allowed disabled:opacity-60'
      >
        <svg width={21} height={21} viewBox='0 0 21 21' xmlns='http://www.w3.org/2000/svg'>
          <path
            d='m10.0799 1.48828h-9.08818v9.08812h9.08818zm10.0881 0h-9.0881v9.08812h9.0881zm-10.0881 10.08812h-9.08818v9.0882h9.08818zm10.0881 0h-9.0881v9.0882h9.0881z'
            fill='#f25022'
          />
          <path d='m10.0799 1.48828h-9.08818v9.08812h9.08818z' fill='#f25022' />
          <path d='m20.168 1.48828h-9.0881v9.08812h9.0881z' fill='#7fba00' />
          <path d='m10.0799 11.5764h-9.08818v9.0882h9.08818z' fill='#00a4ef' />
          <path d='m20.168 11.5764h-9.0881v9.0882h9.0881z' fill='#ffb900' />
        </svg>
        {getButtonContent()}
      </Button>

      {error && <div className='mt-1 text-xs text-red-600'>{error}</div>}
    </div>
  );
}
