import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@owox/ui/components/button';

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

interface TikTokAuthMessage {
  type: 'TIKTOK_AUTH_SUCCESS' | 'TIKTOK_AUTH_ERROR';
  authCode?: string;
  state?: string;
  error?: string;
}

const TIKTOK_AUTH_URL = 'https://business-api.tiktok.com/portal/auth';

function isTikTokAuthMessage(data: unknown): data is TikTokAuthMessage {
  if (typeof data !== 'object' || data === null) return false;
  const msg = data as Record<string, unknown>;
  return msg.type === 'TIKTOK_AUTH_SUCCESS' || msg.type === 'TIKTOK_AUTH_ERROR';
}

export function TikTokLoginButton({
  appId,
  redirectUri,
  onSuccess,
  onError,
  disabled = false,
  children,
}: TikTokLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const authCompletedRef = useRef(false);
  const stateRef = useRef<string | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent<unknown>) => {
      try {
        const redirectOrigin = new URL(redirectUri).origin;
        if (event.origin !== redirectOrigin && event.origin !== window.location.origin) {
          return;
        }
      } catch {
        if (event.origin !== window.location.origin) {
          return;
        }
      }

      const data = event.data;

      if (!isTikTokAuthMessage(data)) {
        return;
      }

      const cleanup = () => {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setIsLoading(false);
      };

      const handleAuthError = (errorMsg: string) => {
        cleanup();
        const err = new Error(errorMsg);
        setError(err.message);
        onError?.(err);
      };

      const handleAuthSuccess = (code: string) => {
        cleanup();
        setError(null);
        stateRef.current = null;
        onSuccess({ authCode: code });
      };

      if (data.type === 'TIKTOK_AUTH_SUCCESS' && data.authCode) {
        if (authCompletedRef.current) return;

        if (!data.state || data.state !== stateRef.current) {
          console.error('State mismatch in LoginButton', {
            received: data.state,
            expected: stateRef.current,
          });
          handleAuthError('Security Error: OAuth State Mismatch');
          return;
        }

        authCompletedRef.current = true;
        handleAuthSuccess(data.authCode);
      } else if (data.type === 'TIKTOK_AUTH_ERROR') {
        handleAuthError(data.error ?? 'TikTok authentication failed');
      }
    },
    [redirectUri, onSuccess, onError]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [handleMessage]);

  const buildAuthUrl = (state: string) => {
    const url = new URL(TIKTOK_AUTH_URL);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    return url.toString();
  };

  const openCenteredPopup = (url: string, title: string) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    return window.open(
      url,
      title,
      `width=${String(width)},height=${String(height)},left=${String(left)},top=${String(top)},scrollbars=yes,resizable=yes`
    );
  };

  const setupOAuthWindowPolling = (popup: Window) => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
    }
    pollTimerRef.current = setInterval(() => {
      if (popup.closed) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setIsLoading(false);
        if (!authCompletedRef.current) {
          stateRef.current = null;
        }
      }
    }, 500);
  };

  const handleLogin = () => {
    if (!appId || !redirectUri) {
      const err = new Error('TikTok OAuth configuration is incomplete');
      setError(err.message);
      onError?.(err);
      return;
    }

    setIsLoading(true);
    setError(null);
    authCompletedRef.current = false;

    const state = Math.random().toString(36).substring(2, 15);
    stateRef.current = state;

    const popup = openCenteredPopup(buildAuthUrl(state), 'TikTok OAuth');

    if (!popup) {
      setIsLoading(false);
      const err = new Error('Failed to open popup window. Please allow popups for this site.');
      setError(err.message);
      onError?.(err);
      return;
    }

    setupOAuthWindowPolling(popup);
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
