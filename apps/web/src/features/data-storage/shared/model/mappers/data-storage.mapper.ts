import type { DataStorageResponseDto } from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { StorageMapperFactory } from './storage-mapper.factory.ts';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export function mapDataStorageFromDto(dto: DataStorageResponseDto): DataStorage {
  const mapper = StorageMapperFactory.getMapper(dto.type);
  return mapper.mapFromDto(dto);
}

export function mapToUpdateDataStorageRequest(formData: DataStorageFormData) {
  const mapper = StorageMapperFactory.getMapper(formData.type);
  return {
    title: formData.title,
    ...mapper.mapToUpdateRequest(formData),
  };
}
