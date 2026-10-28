import type { DataStorageConfigDto, DataStorageResponseDto } from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export interface StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage;
  mapToUpdateRequest(formData: Partial<DataStorageFormData>): {
    config: DataStorageConfigDto;
  };
}
