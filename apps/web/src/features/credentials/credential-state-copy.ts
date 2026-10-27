import type { CredentialState, CredentialSummary } from './types';

type FailedState = Exclude<CredentialState, 'ready'>;

const STATE_LABELS: Record<FailedState, string> = {
  disabled: 'Credential disabled',
  'not-configured': 'Google sign-in is not configured on this server',
  'reconnect-required': 'Reconnect the Credential',
  'reauthorize-required': 'Reconnect the Credential to grant permissions',
};

// A member who cannot see the Credential cannot fix it, so the copy names who can.
const RESTRICTED_LABELS: Partial<Record<CredentialState, string>> = {
  disabled: "Ask the Credential's owner to enable it",
  'reconnect-required': "Ask the Credential's owner to reconnect it",
  'reauthorize-required': "Ask the Credential's owner to reconnect it",
};

/** Why a Storage or Destination cannot use its Credential. */
export function credentialStateLabel(
  access: CredentialSummary['access'],
  state: FailedState
): string {
  return (access === 'restricted' ? RESTRICTED_LABELS[state] : undefined) ?? STATE_LABELS[state];
}
