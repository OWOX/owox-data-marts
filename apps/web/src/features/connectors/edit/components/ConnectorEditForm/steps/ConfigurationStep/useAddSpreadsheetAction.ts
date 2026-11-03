import { toast } from 'react-hot-toast';
import { useCredentials } from '../../../../../../credentials/useCredentials';
import { useGoogleSheetsPicker } from '../../../../../../google-oauth';
import { useOAuth } from '../../../../../shared/model/hooks/useOAuth';
import {
  addSpreadsheetHint,
  connectedEmail,
  signerHint,
  UNAVAILABLE_HINT,
} from '../../../../../shared/utils/add-spreadsheet-hint.utils';
import { GOOGLE_SHEETS_CONNECTOR_NAME } from '../../../../../shared/utils/google-sheets-fields.utils';
import type { DynamicOptionsAction } from './ConfigurationField';

const LABEL = '+ Add spreadsheet';
const noop = () => undefined;

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
  // A refusal shows its hint; no filePicking (null, or an older backend) offers nothing.
  if (credential.filePicking !== 'allowed') {
    const hint = addSpreadsheetHint(credential);
    return hint ? disabledAction(hint) : undefined;
  }

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
