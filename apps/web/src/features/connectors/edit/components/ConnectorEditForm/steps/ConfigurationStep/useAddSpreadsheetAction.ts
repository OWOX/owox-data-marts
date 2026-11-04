import { toast } from 'react-hot-toast';
import { useCredentials } from '../../../../../../credentials/useCredentials';
import { useGoogleSheetsPicker } from '../../../../../../google-oauth';
import { useOAuth } from '../../../../../shared/model/hooks/useOAuth';
import {
  connectedEmail,
  RECONNECT_HINT,
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
 * "+ Add spreadsheet" for the spreadsheet list of a Google Sheets Source Credential. Google gives
 * the Picker token only to a person signed in to the Credential's account.
 */
export function useAddSpreadsheetAction(
  credentialId: string | null,
  onPicked: (spreadsheetUrl: string, spreadsheetName: string) => void
): DynamicOptionsAction | undefined {
  const { credentials, isPending, isSuccess } = useCredentials();
  const { getSettings } = useOAuth();
  const { openPicker } = useGoogleSheetsPicker();

  // While the list loads nothing is known yet, so nothing is offered rather than a flashing hint.
  if (!credentialId || isPending) return undefined;

  const credential = credentials.find(item => item.id === credentialId);
  // A loaded list without the Credential: the member cannot use it.
  if (!credential) return isSuccess ? undefined : disabledAction(UNAVAILABLE_HINT);
  if (credential.canUse === false) return undefined;
  const email = connectedEmail(credential);
  if (!email) return disabledAction(RECONNECT_HINT);

  return {
    label: LABEL,
    onSelect: async () => {
      try {
        const { vars } = await getSettings(GOOGLE_SHEETS_CONNECTOR_NAME, 'AuthType.oauth2');
        const apiKey = vars.PickerApiKey as string | undefined;
        const appId = vars.ProjectNumber as string | undefined;
        const clientId = vars.ClientId as string | undefined;
        if (!apiKey || !appId || !clientId) {
          throw new Error('Google Picker configuration is incomplete');
        }
        await openPicker({
          apiKey,
          appId,
          clientId,
          hintEmail: email,
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
