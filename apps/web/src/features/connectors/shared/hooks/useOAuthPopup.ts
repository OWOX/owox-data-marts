import { useState, useEffect, useCallback, useRef } from 'react';

interface UseOAuthPopupOptions<TResponse, TAuthMessage> {
  redirectUri: string;
  buildAuthUrl: (state: string) => string;
  onSuccess: (response: TResponse) => void;
  onError?: (error: Error) => void;
  isAuthMessage: (data: unknown) => data is TAuthMessage;
  getSuccessResponse: (data: TAuthMessage) => TResponse;
  getErrorMessage: (data: TAuthMessage) => string;
}

export function useOAuthPopup<TResponse, TAuthMessage>({
  redirectUri,
  buildAuthUrl,
  onSuccess,
  onError,
  isAuthMessage,
  getSuccessResponse,
  getErrorMessage,
}: UseOAuthPopupOptions<TResponse, TAuthMessage>) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

      if (!isAuthMessage(data)) {
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

      const handleAuthSuccess = (response: TResponse) => {
        cleanup();
        setError(null);
        stateRef.current = null;
        onSuccess(response);
      };

      const msg = data as { type?: string; state?: string | null };
      const isSuccess = typeof msg.type === 'string' && msg.type.includes('SUCCESS');

      if (isSuccess) {
        if (authCompletedRef.current) return;

        if (!msg.state || msg.state !== stateRef.current) {
          console.error('State mismatch in LoginButton', {
            received: msg.state,
            expected: stateRef.current,
          });
          handleAuthError('Security Error: OAuth State Mismatch');
          return;
        }

        authCompletedRef.current = true;
        handleAuthSuccess(getSuccessResponse(data));
      } else {
        handleAuthError(getErrorMessage(data) || 'Authentication failed');
      }
    },
    [redirectUri, onSuccess, onError, isAuthMessage, getSuccessResponse, getErrorMessage]
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

  const openPopup = () => {
    setIsLoading(true);
    setError(null);
    authCompletedRef.current = false;

    const state = crypto.randomUUID();
    stateRef.current = state;

    const popup = openCenteredPopup(buildAuthUrl(state), 'OAuth Application');

    if (!popup) {
      setIsLoading(false);
      const err = new Error('Failed to open popup window. Please allow popups for this site.');
      setError(err.message);
      onError?.(err);
      return;
    }

    setupOAuthWindowPolling(popup);
  };

  return { openPopup, isLoading, error };
}
