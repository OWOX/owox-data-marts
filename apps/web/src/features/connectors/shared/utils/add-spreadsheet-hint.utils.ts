import { isFieldsMetadata, type Credential } from '../../../credentials/types';

const RECONNECT_HINT = 'Reconnect this Credential to add spreadsheets.';
const EDIT_ACCESS_HINT = 'You need edit access to this Credential to add spreadsheets.';
const NOT_RECORDED_HINT = 'Ask a member who can edit this Credential to reconnect it.';
export const UNAVAILABLE_HINT =
  'Spreadsheets cannot be added right now. Reload the page and try again.';

export const signerHint = (account: string) =>
  `Spreadsheets are added by the person who connected ${account}. Connect your own Google account to add one.`;

export const connectedEmail = (credential: Credential) => {
  const metadata = credential.publicMetadata;
  return (isFieldsMetadata(metadata) ? metadata.connection?.account?.email : null) ?? undefined;
};

/** Why the member may not open Google Picker with this Credential; undefined when they may or when no Picker opens. */
export function addSpreadsheetHint(credential: Credential): string | undefined {
  switch (credential.filePicking) {
    case 'reconnect':
      return RECONNECT_HINT;
    case 'signer-without-edit':
      return EDIT_ACCESS_HINT;
    case 'other-signer':
      return signerHint(connectedEmail(credential) ?? 'this Google account');
    case 'not-recorded':
      return NOT_RECORDED_HINT;
    default:
      return undefined;
  }
}
