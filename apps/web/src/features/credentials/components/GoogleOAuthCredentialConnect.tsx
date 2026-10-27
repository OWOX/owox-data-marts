import { FormItem } from '@owox/ui/components/form';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { wasErrorToastShown } from '../../../app/api';
import { apiErrorMessage } from '../../../app/api/extract-api-error.util';
import { GoogleOAuthButton } from '../../google-oauth/components';
import {
  GoogleOAuthPopupClosedError,
  openGoogleOAuthPopup,
} from '../../google-oauth/utils/open-google-oauth-popup';
import { isOAuthMetadata, type Credential } from '../types';
import { credentialFieldHelp, HelpLabel } from './CredentialHelp';
import { useCredentialActions, useGoogleOAuthAvailable } from '../useCredentials';

interface GoogleOAuthCredentialConnectProps {
  credential: Credential | null;
  /** Definition to connect; sent with the authorize request. */
  definitionId: string;
  /** Blocks Reconnect while the form holds unsaved edits. */
  disabled?: boolean;
  /** Values of the form, used only when a new Credential is created. */
  draft: { title: string; availableForUse: boolean; availableForMaintenance: boolean };
  onConnected: (credential: Credential) => void;
}

export function GoogleOAuthCredentialConnect({
  credential,
  definitionId,
  disabled = false,
  draft,
  onConnected,
}: GoogleOAuthCredentialConnectProps) {
  const available = useGoogleOAuthAvailable();
  const actions = useCredentialActions();
  const [connecting, setConnecting] = useState(false);
  const account = isOAuthMetadata(credential?.publicMetadata)
    ? credential.publicMetadata.account
    : null;
  const email = account?.email ?? credential?.identity ?? null;
  // A converted Credential may store an empty name and email.
  const accountLabel = [account?.name, email].find(Boolean) ?? 'Google account';
  // An OAuth Credential exists only with a grant; a rejected one offers Connect with Google again.
  const connected = Boolean(credential) && credential?.validationState !== 'rejected';

  const connect = async () => {
    setConnecting(true);
    try {
      const redirectUri = `${window.location.origin}/oauth/google/callback`;
      const { authorizationUrl } = await actions.authorizeGoogleOAuth(
        credential
          ? { redirectUri, credentialId: credential.id, definitionId }
          : { redirectUri, definitionId }
      );
      const { code, state } = await openGoogleOAuthPopup(authorizationUrl);
      const title = draft.title.trim();
      const saved = await actions.exchangeGoogleOAuth(
        credential
          ? { code, state }
          : {
              code,
              state,
              ...(title ? { title } : {}),
              availableForUse: draft.availableForUse,
              availableForMaintenance: draft.availableForMaintenance,
            }
      );
      onConnected(saved);
    } catch (caught) {
      if (caught instanceof GoogleOAuthPopupClosedError || wasErrorToastShown(caught)) return;
      toast.error(apiErrorMessage(caught, 'Could not connect your Google account'));
    } finally {
      setConnecting(false);
    }
  };

  if (!credential && !available) return null;
  const help = credentialFieldHelp(definitionId, 'account');

  return (
    <FormItem>
      <div className='mb-4'>
        <HelpLabel tooltip={help?.tooltip}>Connect with Google OAuth</HelpLabel>
      </div>
      {(available === true || connected) && (
        <GoogleOAuthButton
          busy={connecting}
          disabled={!available || connecting || disabled}
          onClick={() => void connect()}
        >
          {connecting ? (
            'Connecting...'
          ) : connected ? (
            <>
              Authenticated as <strong>{accountLabel}</strong>
            </>
          ) : (
            'Connect with Google'
          )}
        </GoogleOAuthButton>
      )}
      {available && credential && !connected && email && (
        <p className='text-muted-foreground text-sm'>
          Reconnect with <strong>{email}</strong>. A different Google account is refused.
        </p>
      )}
      {credential && available === false && (
        <p className='text-muted-foreground text-sm'>
          Google sign-in is not configured on this server.
        </p>
      )}
      {available && disabled && (
        <p className='text-muted-foreground text-sm'>Save or discard your changes to reconnect.</p>
      )}
      {help?.Description && (
        <div className='text-muted-foreground text-sm'>
          <help.Description />
        </div>
      )}
    </FormItem>
  );
}
