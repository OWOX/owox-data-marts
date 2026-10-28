import { StatusLabel, StatusTypeEnum } from '../../../../shared/components/StatusLabel';
import type { StorageCredentialSummary } from '../model/types';
import { credentialStateLabel } from './storage-credential-copy';

/** Says why a Storage cannot use its Credential; nothing while the Credential is ready. */
export function StorageCredentialStateMark({
  summary,
}: {
  summary: StorageCredentialSummary | null | undefined;
}) {
  if (!summary || summary.state === 'ready') return null;
  const { access, state } = summary;
  return (
    <StatusLabel type={StatusTypeEnum.ERROR}>{credentialStateLabel(access, state)}</StatusLabel>
  );
}
