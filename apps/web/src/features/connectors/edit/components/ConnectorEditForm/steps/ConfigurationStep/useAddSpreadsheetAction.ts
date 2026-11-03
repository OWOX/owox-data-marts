import { toast } from 'react-hot-toast';
import { useCredentials } from '../../../../../../credentials/useCredentials';
import { isFieldsMetadata, type Credential } from '../../../../../../credentials/types';
import { useGoogleSheetsPicker } from '../../../../../../google-oauth';
import { useOAuth } from '../../../../../shared/model/hooks/useOAuth';
import { GOOGLE_SHEETS_CONNECTOR_NAME } from '../../../../../shared/utils/google-sheets-fields.utils';
import type { DynamicOptionsAction } from './ConfigurationField';

const LABEL = '+ Add spreadsheet';
const RECONNECT_HINT = 'Reconnect this Credential to add spreadsheets.';
const EDIT_ACCESS_HINT = 'You need edit access to this Credential to add spreadsheets.';
const UNAVAILABLE_HINT = 'Spreadsheets cannot be added right now. Reload the page and try again.';
const noop = () => undefined;

const signerHint = (account: string) =>
  `Spreadsheets are added by the person who connected ${account}. Connect your own Google account to add one.`;

const connectedEmail = (credential: Credential) => {
  const metadata = credential.publicMetadata;
  return (isFieldsMetadata(metadata) ? metadata.connection?.account?.email : null) ?? undefined;
};

/** Why the member may not open Google Picker with this Credential; undefined when they may. */
export function addSpreadsheetHint(credential: Credential): string | undefined {
  switch (credential.filePicking) {
    case 'allowed':
    case null:
      return undefined;
    case 'reconnect':
      return RECONNECT_HINT;
    case 'signer-without-edit':
      return EDIT_ACCESS_HINT;
    case 'other-signer':
      return signerHint(connectedEmail(credential) ?? 'this Google account');
    case undefined:
      return UNAVAILABLE_HINT;
    default:
      return signerHint('this Google account');
  }
}

const disabledAction = (hint: string): DynamicOptionsAction => ({
  label: LABEL,
  onSelect: noop,
  disabled: true,
  hint,
});

/**
 * "+ Add spreadsheet" for the spreadsheet list of a Credential that opens Google Picker: Picker
 * opens with the Credential's own token, which only the member who signed it in may get.
 */
export function useAddSpreadsheetAction(
  credentialId: string | null,
  onPicked: (spreadsheetUrl: string, spreadsheetName: string) => void
): DynamicOptionsAction | undefined {
  const { credentials, isPending, isSuccess } = useCredentials();
  const { getSettings, getPickerToken } = useOAuth();
  const { openPicker } = useGoogleSheetsPicker();

  // While the list loads nothing is known yet, so nothing is offered rather than a flashing hint.
  if (!credentialId || isPending) return undefined;

  const credential = credentials.find(item => item.id === credentialId);
  // A loaded list without the Credential: the member cannot see it, so cannot be its signer.
  if (!credential) {
    return disabledAction(isSuccess ? signerHint('this Google account') : UNAVAILABLE_HINT);
  }
  if (credential.filePicking === null) return undefined;
  const hint = addSpreadsheetHint(credential);
  if (hint) return disabledAction(hint);

  return {
    label: LABEL,
    onSelect: async () => {
      try {
        const { vars } = await getSettings(GOOGLE_SHEETS_CONNECTOR_NAME, 'AuthType.oauth2');
        const apiKey = vars.PickerApiKey as string | undefined;
        const appId = vars.ProjectNumber as string | undefined;
        if (!apiKey || !appId) throw new Error('Google Picker configuration is incomplete');
        await openPicker({
          apiKey,
          appId,
          hintEmail: connectedEmail(credential),
          accessToken: () => getPickerToken(GOOGLE_SHEETS_CONNECTOR_NAME, credentialId),
          onPicked: spreadsheet => {
            onPicked(spreadsheet.url, spreadsheet.name);
          },
          onError: message => {
            toast.error(message);
          },
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not open Google Picker');
      }
    },
  };
}
