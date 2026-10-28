import { CopyableField } from '@owox/ui/components/common/copyable-field';
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

const QUICK_CONNECT_TOOLTIP = 'Authorize OWOX to access your Google Sheets';

interface GoogleOAuthCredentialConnectProps {
  credential: Credential | null;
  /** Definition to connect; sent with the authorize request. */
  definitionId: string;
  /** The OAuth client the definition names; without it, the Storage client decides availability. */
  client?: 'storage' | 'destination';
  /** Blocks Reconnect while the form holds unsaved edits. */
  disabled?: boolean;
  /** Values of the form, used only when a new Credential is created. */
  draft: { title: string; availableForUse: boolean; availableForMaintenance: boolean };
  onConnected: (credential: Credential) => void;
  /** 'quick-connect' is the standalone Google Sheets page: no help, inline errors, the email field. */
  variant?: 'default' | 'quick-connect';
}

export function GoogleOAuthCredentialConnect({
  credential,
  definitionId,
  client,
  disabled = false,
  draft,
  onConnected,
  variant = 'default',
}: GoogleOAuthCredentialConnectProps) {
  const quick = variant === 'quick-connect';
  const available = useGoogleOAuthAvailable(client);
  const actions = useCredentialActions();
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
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
    setConnectError(null);
    try {
      const redirectUri = `${window.location.origin}/oauth/google/callback`;
      const { authorizationUrl } = await actions.authorizeGoogleOAuth({
        redirectUri,
        definitionId,
        // A shown Credential is reconnected, never connected again as another one.
        ...(credential ? { credentialId: credential.id } : {}),
        ...(quick ? { skipErrorToast: true } : {}),
      });
      const { code, state } = await openGoogleOAuthPopup(authorizationUrl);
      const title = draft.title.trim();
      const saved = await actions.exchangeGoogleOAuth({
        ...(credential
          ? { code, state }
          : {
              code,
              state,
              ...(title ? { title } : {}),
              availableForUse: draft.availableForUse,
              availableForMaintenance: draft.availableForMaintenance,
            }),
        ...(quick ? { skipErrorToast: true } : {}),
      });
      onConnected(saved);
    } catch (caught) {
      if (caught instanceof GoogleOAuthPopupClosedError) return;
      if (quick) {
        setConnectError(
          apiErrorMessage(caught, 'Failed to connect your Google account. Please try again.')
        );
      } else if (!wasErrorToastShown(caught)) {
        toast.error(apiErrorMessage(caught, 'Could not connect your Google account'));
      }
    } finally {
      setConnecting(false);
    }
  };

  // While availability loads, the quick-connect page shows the disabled button.
  if (!credential && !available && !(quick && available === undefined)) return null;
  const help = credentialFieldHelp(definitionId, 'account');
  const label = (
    <HelpLabel tooltip={quick ? QUICK_CONNECT_TOOLTIP : help?.tooltip}>
      Connect with Google OAuth
    </HelpLabel>
  );
  // On the quick-connect page the label sits directly in the item, as it always did there.
  const labelNode = quick ? label : <div className='mb-4'>{label}</div>;

  return (
    <FormItem>
      {labelNode}
      {(available === true || connected || (quick && available === undefined)) && (
        <GoogleOAuthButton
          busy={connecting || (quick && available === undefined)}
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
      {!quick && available && credential && !connected && email && (
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
      {connectError && <p className='text-destructive text-sm'>{connectError}</p>}
      {quick && connected && email && (
        <div className='mt-2 flex flex-col gap-1'>
          <HelpLabel>Authenticated email</HelpLabel>
          <CopyableField value={email}>{email}</CopyableField>
        </div>
      )}
      {!quick && help?.Description && (
        <div className='text-muted-foreground text-sm'>
          <help.Description />
        </div>
      )}
    </FormItem>
  );
}
