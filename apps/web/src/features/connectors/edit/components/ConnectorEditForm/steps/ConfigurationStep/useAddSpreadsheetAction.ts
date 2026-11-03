import { toast } from 'react-hot-toast';
import { useCredentials } from '../../../../../../credentials/useCredentials';
import { isFieldsMetadata } from '../../../../../../credentials/types';
import { useGoogleSheetsPicker } from '../../../../../../google-oauth';
import { useOAuth } from '../../../../../shared/model/hooks/useOAuth';
import { GOOGLE_SHEETS_CONNECTOR_NAME } from '../../../../../shared/utils/google-sheets-fields.utils';
import type { DynamicOptionsAction } from './ConfigurationField';

const LABEL = '+ Add spreadsheet';
const RECONNECT_HINT = 'Reconnect this Credential to add spreadsheets.';
const UNAVAILABLE_HINT = 'Spreadsheets cannot be added right now. Reload the page and try again.';
const noop = () => undefined;

const signerHint = (account: string) =>
  `Spreadsheets are added by the person who connected ${account}. Connect your own Google account to add one.`;

/**
 * "+ Add spreadsheet" for the spreadsheet list of a Sheets Source Credential: Picker opens with the
 * Credential's own token, which only the member who signed it in may get.
 */
export function useAddSpreadsheetAction(
  credentialId: string | null,
  onPicked: (spreadsheetUrl: string) => void
): DynamicOptionsAction | undefined {
  const { credentials } = useCredentials();
  const { getSettings, getPickerToken } = useOAuth();
  const { openPicker } = useGoogleSheetsPicker();

  if (!credentialId) return undefined;

  const credential = credentials.find(item => item.id === credentialId);
  const metadata = credential?.publicMetadata;
  const email =
    (isFieldsMetadata(metadata) ? metadata.connection?.account?.email : null) ?? undefined;

  switch (credential?.filePicking) {
    case 'allowed':
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
              hintEmail: email,
              accessToken: () => getPickerToken(GOOGLE_SHEETS_CONNECTOR_NAME, credentialId),
              onPicked: spreadsheet => {
                onPicked(spreadsheet.url);
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
    case 'reconnect':
      return { label: LABEL, onSelect: noop, disabled: true, hint: RECONNECT_HINT };
    case 'other-signer':
      return {
        label: LABEL,
        onSelect: noop,
        disabled: true,
        hint: signerHint(email ?? 'this Google account'),
      };
    case undefined:
      return { label: LABEL, onSelect: noop, disabled: true, hint: UNAVAILABLE_HINT };
    default:
      return {
        label: LABEL,
        onSelect: noop,
        disabled: true,
        hint: signerHint('this Google account'),
      };
  }
}
