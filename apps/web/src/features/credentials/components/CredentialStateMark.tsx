import { StatusLabel, StatusTypeEnum } from '../../../shared/components/StatusLabel';
import { credentialStateLabel } from '../credential-state-copy';
import type { CredentialSummary } from '../types';

/** Says why a Storage or Destination cannot use its Credential; nothing while it is ready. */
export function CredentialStateMark({
  summary,
}: {
  summary: CredentialSummary | null | undefined;
}) {
  if (!summary || summary.state === 'ready') return null;
  const { access, state } = summary;
  return (
    <StatusLabel type={StatusTypeEnum.ERROR}>{credentialStateLabel(access, state)}</StatusLabel>
  );
}
