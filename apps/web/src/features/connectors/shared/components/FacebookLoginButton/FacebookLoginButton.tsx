import { useEffect, useState } from 'react';
import { Button } from '@owox/ui/components/button';

interface FacebookLoginButtonProps {
  appId: string;
  scope: string;
  onSuccess: (response: FacebookLoginResponse) => void;
  onError?: (error: Error) => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

export interface FacebookLoginResponse {
  accessToken: string;
  expiresIn: number;
  userID: string;
  userName?: string;
  userEmail?: string;
}

// Declare Facebook SDK types
declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (params: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
      login: (
        callback: (response: FacebookAuthResponse) => void,
        options: { scope: string }
      ) => void;
      api: (path: string, callback: (response: FacebookUserResponse) => void) => void;
    };
  }
}

interface FacebookAuthResponse {
  status: string;
  authResponse?: {
    accessToken: string;
    expiresIn: number;
    signedRequest: string;
    userID: string;
  };
}

interface FacebookUserResponse {
  name?: string;
  email?: string;
  id?: string;
}

let globalAppId: string | null = null;

export function FacebookLoginButton({
  appId,
  scope,
  onSuccess,
  onError,
  disabled = false,
  children,
}: FacebookLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }

    if (document.getElementById('facebook-jssdk')) {
      const checkInterval = setInterval(() => {
        if (window.FB) {
          setSdkReady(true);
          clearInterval(checkInterval);
        }
      }, 100);
      return () => {
        clearInterval(checkInterval);
      };
    }

    if (!appId) {
      return;
    }

    if (globalAppId && globalAppId !== appId) {
      console.warn('Facebook SDK already initialized with different appId');
      return;
    }

    globalAppId ??= appId;

    window.fbAsyncInit = function () {
      if (window.FB && globalAppId) {
        window.FB.init({
          appId: globalAppId,
          cookie: true,
          xfbml: true,
          version: 'v23.0',
        });
        setSdkReady(true);
      }
    };

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    document.body.appendChild(script);
  }, [appId]);

  const handleLogin = () => {
    if (!window.FB || !sdkReady) {
      const err = new Error('Facebook SDK not loaded or not ready');
      setError(err.message);
      onError?.(err);
      return;
    }

    setIsLoading(true);
    setError(null);

    window.FB.login(
      (response: FacebookAuthResponse) => {
        if (response.status === 'connected' && response.authResponse) {
          const { accessToken, expiresIn, userID } = response.authResponse;

          window.FB?.api('/me?fields=name,email', (userResponse: FacebookUserResponse) => {
            const result: FacebookLoginResponse = {
              accessToken,
              expiresIn,
              userID,
              userName: userResponse.name,
              userEmail: userResponse.email,
            };
            onSuccess(result);
            setIsLoading(false);
          });
        } else {
          const err = new Error('User cancelled login or did not fully authorize');
          setError(err.message);
          onError?.(err);
          setIsLoading(false);
        }
      },
      { scope }
    );
  };

  const isDisabled = disabled || isLoading || !sdkReady;

  const getButtonContent = () => {
    if (isLoading) {
      return 'Connecting...';
    }
    if (children) {
      return children;
    }
    if (!sdkReady) {
      return 'Loading...';
    }
    return 'Continue with Facebook';
  };

  return (
    <div className='flex flex-col gap-2'>
      <Button
        type='button'
        onClick={handleLogin}
        disabled={isDisabled}
        className='flex items-center justify-center gap-2 rounded-md border-none bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166FE5] disabled:cursor-not-allowed disabled:opacity-60'
      >
        <svg width={20} height={20} viewBox='0 0 24 24' fill='currentColor' aria-hidden='true'>
          <path d='M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z' />
        </svg>
        {getButtonContent()}
      </Button>

      {error && <div className='mt-1 text-xs text-red-600'>{error}</div>}
    </div>
  );
}
