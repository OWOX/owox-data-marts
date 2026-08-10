import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

/**
 * Message sent from the OAuth popup back to the window that opened it.
 * On success carries the authorization code and state; on failure carries an error.
 * The opener performs the code exchange with its own session, so this page
 * never calls the API and never needs the app's auth bootstrap.
 */
export interface GoogleOAuthCallbackMessage {
  type: 'OAUTH_CALLBACK';
  code?: string;
  state?: string;
  error?: string;
}

function sendToOpener(
  data: Omit<GoogleOAuthCallbackMessage, 'type'>,
  state: string | null
): boolean {
  const message: GoogleOAuthCallbackMessage = { type: 'OAUTH_CALLBACK', ...data };
  const opener = window.opener as Window | null;
  if (opener) {
    opener.postMessage(message, window.location.origin);
    window.close();
    return true;
  }
  // COOP on the provider side can sever window.opener; fall back to a
  // state-scoped BroadcastChannel the opener also listens on.
  if (state) {
    const bc = new BroadcastChannel(`oauth_channel_${state}`);
    bc.postMessage(message);
    bc.close();
    window.close();
    return true;
  }
  return false;
}

export function GoogleOAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const processed = useRef(false);
  const [fallbackMessage, setFallbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      if (!sendToOpener({ error: `OAuth error: ${errorParam}` }, state)) {
        setFallbackMessage(`Authentication failed: ${errorParam}. You can close this window.`);
      }
      return;
    }

    if (!code || !state) {
      if (!sendToOpener({ error: 'Missing authorization code or state' }, state)) {
        setFallbackMessage('Missing authorization code. You can close this window and try again.');
      }
      return;
    }

    // The opener validates the state against the value it generated and then
    // exchanges the code using its own authenticated session. The server-side
    // JWT signature on the state token remains the real CSRF protection.
    if (!sendToOpener({ code, state }, state)) {
      setFallbackMessage(
        'The window that started the connection is no longer available. ' +
          'Please close this window and try connecting again.'
      );
    }
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
