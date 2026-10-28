import type { DataStorageConfigDto } from '../response';

export interface UpdateDataStorageRequestDto {
  config: DataStorageConfigDto | null;
  reusableCredentialId?: string;
  ownerIds?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contextIds?: string[];
}
