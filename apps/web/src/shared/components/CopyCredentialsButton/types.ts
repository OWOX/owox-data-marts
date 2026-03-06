import type { CredentialIdentity } from '../../types/credential-identity';

export interface CopyCredentialsItem {
  id: string;
  title: string;
  dataMartName: string | null;
  identity: CredentialIdentity | null;
}
