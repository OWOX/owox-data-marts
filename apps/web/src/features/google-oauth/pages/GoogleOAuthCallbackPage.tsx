import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { storageOAuthApi, destinationOAuthApi } from '../api/google-oauth-api.service';

function sendToOpener(data: object): boolean {
  const opener = window.opener as Window | null;
  if (opener) {
    opener.postMessage({ type: 'OAUTH_CALLBACK', ...data }, window.location.origin);
    window.close();
    return true;
  }
  return false;
}

function clearOAuthSessionData() {
  sessionStorage.removeItem('oauth_state');
  sessionStorage.removeItem('oauth_resource_type');
  sessionStorage.removeItem('oauth_resource_id');
}

export function GoogleOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const processed = useRef(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          clearOAuthSessionData();
          if (!sendToOpener({ success: false, error: `OAuth error: ${errorParam}` })) {
            setFallbackMessage(`Authentication failed: ${errorParam}. You can close this window.`);
          }
          return;
        }

        if (!code || !state) {
          clearOAuthSessionData();
          if (!sendToOpener({ success: false, error: 'Missing authorization code or state' })) {
            setFallbackMessage(
              'Missing authorization code. You can close this window and try again.'
            );
          }
          return;
        }

        // Client-side state check (tab-scoped via sessionStorage).
        // The real CSRF protection is the server-side JWT signature in the state token.
        const storedState = sessionStorage.getItem('oauth_state');
        if (state !== storedState) {
          clearOAuthSessionData();
          if (
            !sendToOpener({
              success: false,
              error: 'Invalid state token. Possible CSRF attack. Please try again.',
            })
          ) {
            setFallbackMessage('Invalid state token. You can close this window and try again.');
          }
          return;
        }

        const resourceType = sessionStorage.getItem('oauth_resource_type');

        if (!resourceType || (resourceType !== 'storage' && resourceType !== 'destination')) {
          clearOAuthSessionData();
          if (
            !sendToOpener({
              success: false,
              error: 'Missing resource information. Please try connecting again.',
            })
          ) {
            setFallbackMessage(
              'Missing resource information. You can close this window and try again.'
            );
          }
          return;
        }

        // Exchange code for tokens
        const result =
          resourceType === 'storage'
            ? await storageOAuthApi.exchangeOAuthCode(code, state)
            : await destinationOAuthApi.exchangeOAuthCode(code, state);

        clearOAuthSessionData();

        if (!sendToOpener({ success: true, credentialId: result.credentialId })) {
          setFallbackMessage(
            'Authentication complete. You can close this window and return to the application.'
          );
        }
      } catch (err) {
        clearOAuthSessionData();
        const message =
          err instanceof Error ? err.message : 'Failed to connect your Google account';
        if (!sendToOpener({ success: false, error: message })) {
          setFallbackMessage(
            `Authentication failed: ${message}. You can close this window and try again.`
          );
        }
      }
    };

    void handleCallback();
  }, [searchParams]);

  if (fallbackMessage) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-gray-50'>
        <div className='max-w-md px-4 text-center'>
          <p className='text-sm text-gray-600'>{fallbackMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50'>
      <div className='text-center'>
        <div className='mb-4 inline-block h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900'></div>
        <p className='text-sm text-gray-600'>Completing connection...</p>
      </div>
    </div>
  );
}
