import { useCallback, useEffect, useRef, useState } from 'react';
import {
  storageOAuthApi,
  destinationOAuthApi,
  type OAuthStatus,
} from '../api/google-oauth-api.service';

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

interface OAuthCallbackData {
  type: string;
  code?: string;
  state?: string;
  error?: string;
}

interface GoogleOAuthConnectButtonProps {
  resourceType: 'storage' | 'destination';
  resourceId?: string;
  credentialId?: string;
  redirectUri?: string;
  onSuccess?: (credentialId: string) => void;
  onStatusChange?: (isConnected: boolean, credentialId?: string) => void;
}

export function GoogleOAuthConnectButton({
  resourceType,
  resourceId,
  credentialId: initialCredentialId,
  redirectUri,
  onSuccess,
  onStatusChange,
}: GoogleOAuthConnectButtonProps) {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [currentCredentialId, setCurrentCredentialId] = useState<string | undefined>(
    initialCredentialId
  );
  const popupRef = useRef<Window | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    setCurrentCredentialId(initialCredentialId);
  }, [initialCredentialId]);

  const fetchStatus = useCallback(async () => {
    if (resourceId) {
      try {
        const data =
          resourceType === 'storage'
            ? await storageOAuthApi.getOAuthStatus(resourceId)
            : await destinationOAuthApi.getOAuthStatus(resourceId);
        setStatus(data);
        onStatusChangeRef.current?.(data.isValid, data.isValid ? data.credentialId : undefined);
      } catch {
        setStatus(null);
        onStatusChangeRef.current?.(false);
      } finally {
        setStatusLoading(false);
      }
      return;
    }

    if (currentCredentialId && resourceType === 'destination') {
      try {
        const data = await destinationOAuthApi.getCredentialStatus(currentCredentialId);
        setStatus(data);
        onStatusChangeRef.current?.(data.isValid, data.isValid ? data.credentialId : undefined);
      } catch {
        setStatus(null);
        onStatusChangeRef.current?.(false);
      } finally {
        setStatusLoading(false);
      }
      return;
    }

    setStatusLoading(false);
  }, [resourceType, resourceId, currentCredentialId]);

  useEffect(() => {
    void fetchStatus();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const resolvedRedirectUri = redirectUri ?? `${window.location.origin}/oauth/google/callback`;

      let authorizationUrl: string;
      let state: string;

      if (resourceId) {
        const result =
          resourceType === 'storage'
            ? await storageOAuthApi.generateAuthUrl(resourceId, resolvedRedirectUri)
            : await destinationOAuthApi.generateAuthUrl(resourceId, resolvedRedirectUri);
        authorizationUrl = result.authorizationUrl;
        state = result.state;
      } else {
        const result = await destinationOAuthApi.generateStandaloneAuthUrl(resolvedRedirectUri);
        authorizationUrl = result.authorizationUrl;
        state = result.state;
      }

      const width = 600;
      const height = 700;
      const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
      const popup = window.open(
        authorizationUrl,
        'google-oauth-popup',
        `width=${String(width)},height=${String(height)},left=${String(left)},top=${String(top)},resizable=yes,scrollbars=yes`
      );

      // The popup only forwards the authorization code back here; the exchange
      // runs in THIS window with the same session that generated the state.
      // The popup itself never authenticates, so it cannot race the rotating
      // refresh-token cookie or land in a different project context.
      const bc = new BroadcastChannel(`oauth_channel_${state}`);
      let completed = false;

      const cleanup = () => {
        window.removeEventListener('message', handleMessage);
        bc.close();
        if (intervalRef.current) clearInterval(intervalRef.current);
      };

      const processCallbackData = (data: OAuthCallbackData) => {
        if (data.type !== 'OAUTH_CALLBACK') return;
        if (completed) return;
        completed = true;
        cleanup();

        void (async () => {
          try {
            if (data.error || !data.code) {
              throw new Error(data.error ?? 'No authorization code received from Google');
            }
            if (data.state !== state) {
              throw new Error('Invalid state token. Please try again.');
            }

            const result =
              resourceType === 'storage'
                ? await storageOAuthApi.exchangeOAuthCode(data.code, data.state)
                : await destinationOAuthApi.exchangeOAuthCode(data.code, data.state);

            setConnecting(false);
            setCurrentCredentialId(result.credentialId);
            onSuccess?.(result.credentialId);
            void fetchStatus();
          } catch (error) {
            console.error('Google OAuth connection failed', error);
            setConnecting(false);
            setConnectError(
              error instanceof Error && error.message
                ? error.message
                : 'Failed to connect your Google account. Please try again.'
            );
          }
        })();
      };

      const handleMessage = (event: MessageEvent<OAuthCallbackData>) => {
        if (event.origin !== window.location.origin) return;
        processCallbackData(event.data);
      };
      window.addEventListener('message', handleMessage);
      bc.onmessage = (event: MessageEvent<OAuthCallbackData>) => {
        processCallbackData(event.data);
      };

      if (!popup) {
        cleanup();
        throw new Error('Popup was blocked. Please allow popups for this site and try again.');
      }
      popupRef.current = popup;

      intervalRef.current = setInterval(() => {
        try {
          if (popup.closed && !completed) {
            cleanup();
            setConnecting(false);
          }
        } catch {
          // COOP policy blocks access while popup is on Google's domain — ignore
        }
      }, 500);
    } catch (error) {
      console.error('Failed to start Google OAuth connection', error);
      setConnecting(false);
      setConnectError(
        error instanceof Error
          ? error.message
          : 'Failed to start OAuth connection. Please try again.'
      );
    }
  };

  const isConnected = status?.isValid;
  const userName = status?.user?.name ?? status?.user?.email;
  const isDisabled = statusLoading || connecting;

  return (
    <div className='space-y-2'>
      {isConnected ? (
        <button
          type='button'
          onClick={() => {
            void handleConnect();
          }}
          disabled={isDisabled}
          className='border-input bg-background hover:bg-accent flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'
        >
          <GoogleLogo />
          {connecting ? (
            'Connecting...'
          ) : (
            <>
              Authenticated as <strong>{userName ?? 'Google Account'}</strong>
            </>
          )}
        </button>
      ) : (
        <button
          type='button'
          onClick={() => {
            void handleConnect();
          }}
          disabled={isDisabled}
          className='border-input bg-background hover:bg-accent flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60'
        >
          {statusLoading || connecting ? (
            <span className='h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900' />
          ) : (
            <GoogleLogo />
          )}
          {connecting ? 'Connecting...' : 'Connect with Google'}
        </button>
      )}
      {connectError && <p className='text-destructive text-sm'>{connectError}</p>}
    </div>
  );
}
