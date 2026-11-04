import { Button } from '@owox/ui/components/button';
import { FormItem } from '@owox/ui/components/form';
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { wasErrorToastShown } from '../../../app/api';
import { apiErrorMessage } from '../../../app/api/extract-api-error.util';
import { OauthRenderFactory } from '../../connectors/edit/components/ConnectorEditForm/steps/ConfigurationStep/Oauth/OauthRenderFactory';
import { ConnectPickedSpreadsheetContext } from '../connect-picked-spreadsheet';
import type { Credential } from '../types';
import { HelpLabel } from './CredentialHelp';
import { useCredentialActions } from '../useCredentials';

interface SourceOAuthCredentialConnectProps {
  connectorName: string;
  /** The provider's name, as the card title says it. */
  providerName: string;
  variant: string;
  credential: Credential | null;
  /** Blocks Reconnect while the form holds unsaved edits. */
  disabled?: boolean;
  /** Values of the form, used only when a new Credential is created. */
  draft: { title: string; availableForUse: boolean; availableForMaintenance: boolean };
  onConnected: (credential: Credential) => void;
  /** Whether Connect stands in for the fields, so a new Credential has no Save. */
  onConnectShownChange?: (shown: boolean) => void;
  /** The definition's fields: shown when the connector's sign-in is not configured, or on Manually. */
  children: ReactNode;
}

/** Connect through the connector's own sign-in, as on a Data Mart; the exchange saves the Credential. */
export function SourceOAuthCredentialConnect({
  connectorName,
  providerName,
  variant,
  credential,
  disabled = false,
  draft,
  onConnected,
  onConnectShownChange,
  children,
}: SourceOAuthCredentialConnectProps) {
  const actions = useCredentialActions();
  const onSpreadsheetPicked = useContext(ConnectPickedSpreadsheetContext);
  const pickedSpreadsheet = useRef<string | null>(null);
  // Saved by an exchange whose finish failed: a retry reconnects it instead of creating another.
  const [savedId, setSavedId] = useState<string | null>(null);
  // Whether Connect is offered; the renderer reports it while sign-in settings load or are set.
  const [managed, setManaged] = useState(true);
  const [manual, setManual] = useState(false);
  // The renderer reads the connection status of the Credential id it finds here.
  const [configuration, setConfiguration] = useState<Record<string, unknown>>(() =>
    credential ? { AuthType: { [variant]: { _source_credential_id: credential.id } } } : {}
  );
  // No items: the fields are the definition's, shown here rather than by the renderer.
  const option = useMemo(() => ({ label: variant, value: variant, items: {} }), [variant]);
  const title = draft.title.trim();
  const reconnectId = credential?.id ?? savedId;

  const connectShown = managed && !manual;
  useEffect(() => {
    onConnectShownChange?.(connectShown);
    return () => onConnectShownChange?.(false);
  }, [connectShown, onConnectShownChange]);

  const finishConnect = async (credentialId: string) => {
    try {
      const connected = await actions.loadConnected(credentialId);
      // Before onConnected, whose selection of the Credential takes the pick with it.
      if (pickedSpreadsheet.current) onSpreadsheetPicked?.(credentialId, pickedSpreadsheet.current);
      onConnected(connected);
    } catch (caught) {
      if (!wasErrorToastShown(caught)) {
        toast.error(apiErrorMessage(caught, 'Could not load the connected Credential'));
      }
    }
  };

  if (manual) {
    return (
      <>
        {children}
        <Button
          type='button'
          variant='link'
          size='sm'
          className='w-fit px-0'
          onClick={() => {
            setManaged(true);
            setManual(false);
          }}
        >
          Back to OAuth
        </Button>
      </>
    );
  }

  // The card stays mounted while hidden: its renderer reports whether Connect is configured.
  return (
    <>
      <FormItem className={managed ? undefined : 'hidden'}>
        <div className='mb-4'>
          <HelpLabel>Connect with {providerName}</HelpLabel>
        </div>
        <fieldset
          disabled={disabled}
          className='min-w-0'
          data-testid='sourceOAuthCredentialConnect'
        >
          <OauthRenderFactory
            specification={{ name: 'AuthType' }}
            option={option}
            configuration={configuration}
            onValueChange={(name, value) => {
              setConfiguration(current => ({ ...current, [name]: value }));
              if (name === 'SpreadsheetId' && typeof value === 'string') {
                pickedSpreadsheet.current = value;
              }
            }}
            connectorName={connectorName}
            onManagedModeChange={setManaged}
            credential={
              reconnectId
                ? { id: reconnectId }
                : {
                    ...(title ? { title } : {}),
                    availableForUse: draft.availableForUse,
                    availableForMaintenance: draft.availableForMaintenance,
                  }
            }
            onExchanged={({ credentialId }) => {
              setSavedId(credentialId);
              void finishConnect(credentialId);
            }}
          />
        </fieldset>
        {disabled && (
          <p className='text-muted-foreground text-sm'>
            Save or discard your changes to reconnect.
          </p>
        )}
        <Button
          type='button'
          variant='link'
          size='sm'
          className='w-fit px-0'
          onClick={() => {
            setManual(true);
          }}
        >
          Manually
        </Button>
      </FormItem>
      {!managed && children}
    </>
  );
}
