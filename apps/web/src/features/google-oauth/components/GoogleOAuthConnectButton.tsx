import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GoogleOAuthPopupClosedError,
  openGoogleOAuthPopup,
} from '../utils/open-google-oauth-popup';
import { destinationOAuthApi, type OAuthStatus } from '../api/google-oauth-api.service';
import { GoogleOAuthButton } from './GoogleOAuthButton';

interface GoogleOAuthConnectButtonProps {
  resourceId?: string;
  credentialId?: string;
  redirectUri?: string;
  onSuccess?: (credentialId: string) => void;
  onStatusChange?: (isConnected: boolean, credentialId?: string) => void;
}

export function GoogleOAuthConnectButton({
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
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    setCurrentCredentialId(initialCredentialId);
  }, [initialCredentialId]);

  const fetchStatus = useCallback(async () => {
    if (resourceId) {
      try {
        const data = await destinationOAuthApi.getOAuthStatus(resourceId);
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

    if (currentCredentialId) {
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
  }, [resourceId, currentCredentialId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    setConnectError(null);
    try {
      const resolvedRedirectUri = redirectUri ?? `${window.location.origin}/oauth/google/callback`;

      let authorizationUrl: string;

      if (resourceId) {
        const result = await destinationOAuthApi.generateAuthUrl(resourceId, resolvedRedirectUri);
        authorizationUrl = result.authorizationUrl;
      } else {
        const result = await destinationOAuthApi.generateStandaloneAuthUrl(resolvedRedirectUri);
        authorizationUrl = result.authorizationUrl;
      }

      const { code, state } = await openGoogleOAuthPopup(authorizationUrl);
      const result = await destinationOAuthApi.exchangeOAuthCode(code, state);

      setConnecting(false);
      setCurrentCredentialId(result.credentialId);
      onSuccess?.(result.credentialId);
      void fetchStatus();
    } catch (error) {
      setConnecting(false);
      if (error instanceof GoogleOAuthPopupClosedError) return;
      console.error('Google OAuth connection failed', error);
      setConnectError(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to connect your Google account. Please try again.'
      );
    }
  };

  const isConnected = status?.isValid;
  const userName = status?.user?.name ?? status?.user?.email;
  const isDisabled = statusLoading || connecting;

  return (
    <div className='space-y-2'>
      <GoogleOAuthButton
        onClick={() => {
          void handleConnect();
        }}
        disabled={isDisabled}
        busy={!isConnected && isDisabled}
      >
        {connecting ? (
          'Connecting...'
        ) : isConnected ? (
          <>
            Authenticated as <strong>{userName ?? 'Google Account'}</strong>
          </>
        ) : (
          'Connect with Google'
        )}
      </GoogleOAuthButton>
      {connectError && <p className='text-destructive text-sm'>{connectError}</p>}
    </div>
  );
}
