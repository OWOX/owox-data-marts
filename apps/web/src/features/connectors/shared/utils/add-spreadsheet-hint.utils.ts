import { isFieldsMetadata, type Credential } from '../../../credentials/types';

export const RECONNECT_HINT = 'Reconnect this Credential to add spreadsheets.';
export const UNAVAILABLE_HINT =
  'Spreadsheets cannot be added right now. Reload the page and try again.';

/** The Google account the Credential is signed in with; undefined when none is recorded. */
export const connectedEmail = (credential: Credential) => {
  const metadata = credential.publicMetadata;
  return (isFieldsMetadata(metadata) ? metadata.connection?.account?.email : null) ?? undefined;
};
