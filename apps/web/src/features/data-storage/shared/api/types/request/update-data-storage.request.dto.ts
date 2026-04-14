import type { DataStorageCredentialsDto } from '../data-storage-credentials.dto.ts';
import type { DataStorageConfigDto } from '../response';

export interface UpdateDataStorageRequestDto {
  credentials?: DataStorageCredentialsDto | null;
  config: DataStorageConfigDto | null;
  credentialId?: string | null;
  sourceStorageId?: string; // for credential copy
  ownerIds?: string[];
  availableForUse?: boolean;
  availableForMaintenance?: boolean;
  contextIds?: string[];
}
