import type { CredentialIdentity } from '../../../../../../shared/types/credential-identity';

export interface DataStorageByTypeItemDto {
  id: string;
  title: string;
  dataMartName: string | null;
  identity: CredentialIdentity | null;
}

export type DataStorageByTypeResponseDto = DataStorageByTypeItemDto[];
