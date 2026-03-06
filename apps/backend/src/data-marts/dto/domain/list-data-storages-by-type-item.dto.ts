import type { CredentialIdentity } from '../../entities/credential-identity.type';

export class ListDataStoragesByTypeItemDto {
  id: string;
  title: string;
  dataMartName: string | null;
  identity: CredentialIdentity | null;
}
