import { useEffect, useState, useRef } from 'react';
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
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const authCode = searchParams.get('auth_code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const opener = window.opener as Window | null;
    const TARGET_ORIGIN = window.location.origin;

    if (!opener) {
      console.error('TikTokCallback: Window opener is missing');
      setStatus('error');
      setErrorMessage(
        'Window opener is missing. Cannot complete authentication. Please try again from the main application.'
      );
      return;
    }

    const handleAuthFailure = (errorMsg: string) => {
      setStatus('error');
      setErrorMessage(errorMsg);
      opener.postMessage({ type: 'TIKTOK_AUTH_ERROR', error: errorMsg }, TARGET_ORIGIN);
    };

    if (error) {
      const errorMsg = errorDescription ?? error;
      console.error('TikTokCallback: Auth error received', errorMsg);
      handleAuthFailure(errorMsg);
      return;
    }

    if (!state) {
      handleAuthFailure('Security Error: No state parameter received');
      return;
    }

    if (!authCode) {
      handleAuthFailure('No authorization code received');
      return;
    }

    setStatus('success');
    opener.postMessage({ type: 'TIKTOK_AUTH_SUCCESS', authCode, state }, TARGET_ORIGIN);

    setTimeout(() => {
      window.close();
    }, 1000);
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
