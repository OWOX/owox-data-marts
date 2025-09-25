import type { DataStorageCredentialsDto } from '../data-storage-credentials.dto.ts';
import type { DataStorageConfigDto } from '../response';

export interface UpdateDataStorageRequestDto {
  credentials?: DataStorageCredentialsDto | null;
  config: DataStorageConfigDto | null;
}
