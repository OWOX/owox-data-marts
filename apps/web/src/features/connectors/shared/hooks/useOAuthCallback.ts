import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

interface UseOAuthCallbackOptions {
  providerName: string;
  successType: string;
  errorType: string;
  getSuccessPayload: (searchParams: URLSearchParams) => Record<string, string>;
  hasSuccessData: (searchParams: URLSearchParams) => boolean;
}

export function useOAuthCallback({
  providerName,
  successType,
  errorType,
  getSuccessPayload,
  hasSuccessData,
}: UseOAuthCallbackOptions) {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    const opener = window.opener as Window | null;
    const TARGET_ORIGIN = window.location.origin;

    if (!opener) {
      console.error(`${providerName}Callback: Window opener is missing`);
      setStatus('error');
      setErrorMessage(
        'Window opener is missing. Cannot complete authentication. Please try again from the main application.'
      );
      return;
    }

    const handleAuthFailure = (errorMsg: string) => {
      setStatus('error');
      setErrorMessage(errorMsg);
      opener.postMessage({ type: errorType, error: errorMsg }, TARGET_ORIGIN);
    };

    if (error) {
      const errorMsg = errorDescription ?? error;
      console.error(`${providerName}Callback: Auth error received`, errorMsg);
      handleAuthFailure(errorMsg);
      return;
    }

    if (!state) {
      handleAuthFailure('Security Error: No state parameter received');
      return;
    }

    if (!hasSuccessData(searchParams)) {
      handleAuthFailure('No authorization data received from provider');
      return;
    }

    setStatus('success');
    opener.postMessage(
      {
        type: successType,
        state,
        ...getSuccessPayload(searchParams),
      },
      TARGET_ORIGIN
    );

    setTimeout(() => {
      window.close();
    }, 1000);
  }, [searchParams, providerName, successType, errorType, getSuccessPayload, hasSuccessData]);

  return { status, errorMessage };
}
