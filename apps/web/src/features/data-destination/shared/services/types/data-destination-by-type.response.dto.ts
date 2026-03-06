import type { CredentialIdentity } from '../../../../../shared/types/credential-identity';

export interface DataDestinationByTypeItemDto {
  id: string;
  title: string;
  dataMartName: string | null;
  identity: CredentialIdentity | null;
}

export type DataDestinationByTypeResponseDto = DataDestinationByTypeItemDto[];
