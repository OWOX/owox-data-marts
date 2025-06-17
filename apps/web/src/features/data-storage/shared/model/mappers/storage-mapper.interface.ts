import type {
  DataStorageConfigDto,
  DataStorageCredentialsDto,
  DataStorageResponseDto,
} from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export interface StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage;
  mapToUpdateRequest(formData: DataStorageFormData): {
    credentials: DataStorageCredentialsDto;
    config: DataStorageConfigDto;
  };
}
