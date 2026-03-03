interface OAuthCallbackUIProps {
  status: 'processing' | 'success' | 'error';
  errorMessage: string | null;
}

export function OAuthCallbackUI({ status, errorMessage }: OAuthCallbackUIProps) {
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
