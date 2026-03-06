import type { CredentialIdentity } from '../types/credential-identity';

export const COPY_SOURCE_CREDENTIAL_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

export function getIdentityDisplayString(identity: CredentialIdentity | null): string {
  if (!identity) return '';
  return (
    identity.email ??
    identity.clientEmail ??
    identity.username ??
    identity.accessKeyId ??
    identity.name ??
    ''
  );
}

export function getAuthTypeLabel(identity: CredentialIdentity | null): string {
  if (!identity) return '';
  if (identity.clientEmail) return 'Service Account';
  if (identity.email) return 'OAuth';
  if (identity.username) return 'Snowflake';
  if (identity.accessKeyId) return 'IAM';
  return '';
}
