import { credentialStateLabel } from '../../../credentials/credential-state-copy';
import type { StorageCredentialSummary } from '../model/types';
import { DataStorageHealthStatus } from '../services/data-storage-health-status.service';

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
  return compact && state === 'disabled' ? credentialStateLabel('visible', 'disabled') : undefined;
}
