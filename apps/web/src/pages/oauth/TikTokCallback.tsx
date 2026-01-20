import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * OAuth callback page for TikTok authentication.
 * This page handles the redirect from TikTok OAuth flow,
 * extracts the authorization code, and passes it back to the opener window.
 */
export function TikTokCallback() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const authCode = searchParams.get('auth_code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Verify state parameter matches
    // Use localStorage because popup and parent window don't share sessionStorage
    const savedState = localStorage.getItem('tiktok_oauth_state');

    const opener = window.opener as Window | null;

    if (error) {
      setStatus('error');
      const errorMsg = errorDescription ?? error;
      setErrorMessage(errorMsg);
      console.error('TikTokCallback: Auth error received', errorMsg);

      if (opener) {
        opener.postMessage({ type: 'TIKTOK_AUTH_ERROR', error: errorMsg }, window.location.origin);
      }
      return;
    }

    if (!authCode) {
      setStatus('error');
      setErrorMessage('No authorization code received');

      if (opener) {
        opener.postMessage(
          { type: 'TIKTOK_AUTH_ERROR', error: 'No authorization code received' },
          window.location.origin
        );
      }
      return;
    }

    if (!savedState) {
      console.warn(
        'TikTokCallback: State parameter missing from localStorage - stopping processing'
      );
      return;
    }

    if (state !== savedState) {
      console.error('TikTokCallback: State mismatch', { state, savedState });
      setStatus('error');
      setErrorMessage('State parameter mismatch - possible CSRF attack');

      if (opener) {
        opener.postMessage(
          { type: 'TIKTOK_AUTH_ERROR', error: 'State parameter mismatch' },
          window.location.origin
        );
      }
      return;
    }

    // Clear the saved state
    localStorage.removeItem('tiktok_oauth_state');

    // Success - send the auth code to the opener
    setStatus('success');

    if (opener) {
      opener.postMessage({ type: 'TIKTOK_AUTH_SUCCESS', authCode }, window.location.origin);

      // Close the popup after a short delay
      setTimeout(() => {
        window.close();
      }, 1000);
    }
  }, [searchParams]);

  return (
    <div className='flex min-h-screen items-center justify-center bg-gray-50'>
      <div className='max-w-md rounded-lg bg-white p-8 shadow-lg'>
        {status === 'processing' && (
          <div className='text-center'>
            <div className='mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-black'></div>
            <h2 className='text-lg font-semibold text-gray-900'>Processing authentication...</h2>
            <p className='mt-2 text-sm text-gray-600'>
              Please wait while we complete the connection.
            </p>
          </div>
        )}

        {status === 'success' && (
          <div className='text-center'>
            <div className='mb-4 text-green-500'>
              <svg
                className='mx-auto h-12 w-12'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M5 13l4 4L19 7'
                />
              </svg>
            </div>
            <h2 className='text-lg font-semibold text-gray-900'>Authentication successful!</h2>
            <p className='mt-2 text-sm text-gray-600'>This window will close automatically.</p>
          </div>
        )}

        {status === 'error' && (
          <div className='text-center'>
            <div className='mb-4 text-red-500'>
              <svg
                className='mx-auto h-12 w-12'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M6 18L18 6M6 6l12 12'
                />
              </svg>
            </div>
            <h2 className='text-lg font-semibold text-gray-900'>Authentication failed</h2>
            <p className='mt-2 text-sm text-gray-600'>{errorMessage}</p>
            <button
              onClick={() => {
                window.close();
              }}
              className='mt-4 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800'
            >
              Close Window
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
