import type { StorageCredentialState, StorageCredentialSummary } from '../model/types';
import { DataStorageHealthStatus } from '../services/data-storage-health-status.service';

type FailedState = Exclude<StorageCredentialState, 'ready'>;

const STATE_LABELS: Record<FailedState, string> = {
  disabled: 'Credential disabled',
  'not-configured': 'Google sign-in is not configured on this server',
  'reconnect-required': 'Reconnect the Credential',
  'reauthorize-required': 'Reconnect the Credential to grant permissions',
};

// A member who cannot see the Credential cannot fix it, so the copy names who can.
const RESTRICTED_LABELS: Partial<Record<StorageCredentialState, string>> = {
  disabled: "Ask the Credential's owner to enable it",
  'reconnect-required': "Ask the Credential's owner to reconnect it",
  'reauthorize-required': "Ask the Credential's owner to reconnect it",
};

export function credentialStateLabel(
  access: StorageCredentialSummary['access'],
  state: FailedState
): string {
  return (access === 'restricted' ? RESTRICTED_LABELS[state] : undefined) ?? STATE_LABELS[state];
}

/** Health line when the Credential is the cause; undefined keeps the server's message. */
export function credentialHealthMessage(
  summary: StorageCredentialSummary | null | undefined,
  compact: boolean,
  status: DataStorageHealthStatus
): string | undefined {
  if (!summary) return undefined;
  const { access, state } = summary;
  if (state === 'ready') {
    // Health can see a lost grant before the summary does.
    return access === 'restricted' && status === DataStorageHealthStatus.REAUTH_REQUIRED
      ? credentialStateLabel(access, 'reconnect-required')
      : undefined;
  }
  if (access === 'restricted' || state === 'not-configured') {
    return credentialStateLabel(access, state);
  }
  // Without a code, a disabled Credential reads as a plain failure in the tooltip.
  return compact && state === 'disabled' ? STATE_LABELS.disabled : undefined;
}
