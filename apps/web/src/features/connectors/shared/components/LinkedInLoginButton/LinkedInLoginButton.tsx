import { Button } from '@owox/ui/components/button';
import { useOAuthPopup } from '../../hooks/useOAuthPopup';

interface LinkedInLoginButtonProps {
  clientId: string;
  redirectUri: string;
  scope: string;
  onSuccess: (response: LinkedInLoginResponse) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export interface LinkedInLoginResponse {
  code: string;
}

type LinkedInAuthMessage =
  | { type: 'LINKEDIN_AUTH_SUCCESS'; code: string; state: string | null }
  | { type: 'LINKEDIN_AUTH_ERROR'; error: string };

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';

function isLinkedInAuthMessage(data: unknown): data is LinkedInAuthMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;

  if (msg.type === 'LINKEDIN_AUTH_SUCCESS') {
    return typeof msg.code === 'string';
  }

  if (msg.type === 'LINKEDIN_AUTH_ERROR') {
    return typeof msg.error === 'string';
  }

  return false;
}

export function LinkedInLoginButton({
  clientId,
  redirectUri,
  scope,
  onSuccess,
  onError,
  disabled = false,
  children,
}: LinkedInLoginButtonProps) {
  const { openPopup, isLoading, error } = useOAuthPopup<LinkedInLoginResponse, LinkedInAuthMessage>(
    {
      redirectUri,
      buildAuthUrl: (state: string) => {
        const url = new URL(LINKEDIN_AUTH_URL);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('client_id', clientId);
        url.searchParams.set('redirect_uri', redirectUri);
        url.searchParams.set('state', state);
        url.searchParams.set('scope', scope);
        return url.toString();
      },
      onSuccess,
      onError,
      isAuthMessage: isLinkedInAuthMessage,
      getSuccessResponse: (msg: LinkedInAuthMessage) => {
        if (msg.type === 'LINKEDIN_AUTH_SUCCESS') {
          return { code: msg.code };
        }
        throw new Error('Invalid response');
      },
      getErrorMessage: (msg: LinkedInAuthMessage) => {
        if (msg.type === 'LINKEDIN_AUTH_ERROR') {
          return msg.error;
        }
        return 'Unknown error';
      },
    }
  );

  const handleLogin = () => {
    if (!clientId || !redirectUri) {
      onError?.(new Error('LinkedIn OAuth configuration is incomplete'));
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
    return 'Continue with LinkedIn';
  };

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        onClick={handleLogin}
        disabled={isDisabled}
        className='flex items-center justify-center gap-2 rounded-md border-none bg-[#0A66C2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#004182] disabled:cursor-not-allowed disabled:opacity-60'
      >
        <svg width={20} height={20} viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
          <path d='M4.98 3.5C4.98 4.88 3.86 6 2.48 6S0 4.88 0 3.5 1.12 1 2.5 1 5 2.12 5 3.5zM.5 8h4V24h-4V8zm7 0h3.8v2.2h.1c.53-1 1.84-2.2 3.8-2.2 4.07 0 4.82 2.68 4.82 6.16V24h-4v-7.1c0-1.69-.03-3.86-2.35-3.86-2.36 0-2.72 1.84-2.72 3.74V24h-4V8z' />
        </svg>
        {getButtonContent()}
      </Button>

      {error && <div className='mt-1 text-xs text-red-600'>{error}</div>}
    </div>
  );
}
