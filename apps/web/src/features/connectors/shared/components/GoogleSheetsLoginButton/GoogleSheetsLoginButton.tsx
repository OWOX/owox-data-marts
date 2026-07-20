import { Button } from '@owox/ui/components/button';
import { useOAuthPopup } from '../../hooks/useOAuthPopup';

interface GoogleSheetsLoginButtonProps {
  clientId: string;
  redirectUri: string;
  onSuccess: (response: GoogleSheetsLoginResponse) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export interface GoogleSheetsLoginResponse {
  code: string;
}

type GoogleSheetsAuthMessage =
  | { type: 'GOOGLE_SHEETS_AUTH_SUCCESS'; code: string; state: string | null }
  | { type: 'GOOGLE_SHEETS_AUTH_ERROR'; error: string };

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPE =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

const GoogleLogo = () => (
  <svg className='h-5 w-5 shrink-0' viewBox='0 0 24 24'>
    <path
      fill='#4285F4'
      d='M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z'
    />
    <path
      fill='#34A853'
      d='M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z'
    />
    <path
      fill='#FBBC05'
      d='M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z'
    />
    <path
      fill='#EA4335'
      d='M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z'
    />
  </svg>
);

function isGoogleSheetsAuthMessage(data: unknown): data is GoogleSheetsAuthMessage {
  if (typeof data !== 'object' || data === null) return false;
  const message = data as Record<string, unknown>;

  if (message.type === 'GOOGLE_SHEETS_AUTH_SUCCESS') {
    return typeof message.code === 'string';
  }

  if (message.type === 'GOOGLE_SHEETS_AUTH_ERROR') {
    return typeof message.error === 'string';
  }

  return false;
}

export function GoogleSheetsLoginButton({
  clientId,
  redirectUri,
  onSuccess,
  onError,
  disabled = false,
  children,
}: GoogleSheetsLoginButtonProps) {
  const { openPopup, isLoading, error } = useOAuthPopup<
    GoogleSheetsLoginResponse,
    GoogleSheetsAuthMessage
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
    isAuthMessage: isGoogleSheetsAuthMessage,
    getSuccessResponse: message => {
      if (message.type === 'GOOGLE_SHEETS_AUTH_SUCCESS') {
        return { code: message.code };
      }
      throw new Error('Invalid response');
    },
    getErrorMessage: message => {
      if (message.type === 'GOOGLE_SHEETS_AUTH_ERROR') {
        return message.error;
      }
      return 'Unknown error';
    },
  });

  const handleLogin = () => {
    if (!clientId || !redirectUri) {
      onError?.(new Error('Google Sheets OAuth configuration is incomplete'));
      return;
    }
    openPopup();
  };

  const isDisabled = disabled || isLoading || !clientId || !redirectUri;
  const content = isLoading
    ? 'Connecting...'
    : (children ?? (clientId && redirectUri ? 'Sign in with Google' : 'OAuth not configured'));

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        onClick={handleLogin}
        disabled={isDisabled}
        className='flex items-center justify-center gap-2 rounded-md border border-[#DADCE0] bg-white px-4 py-2.5 text-sm font-semibold text-[#3C4043] hover:bg-[#F8F9FA] disabled:cursor-not-allowed disabled:opacity-60'
      >
        <GoogleLogo />
        {content}
      </Button>
      {error && (
        <div role='alert' className='mt-1 text-xs text-red-600'>
          {error}
        </div>
      )}
    </div>
  );
}
