import type { StorageMapper } from './storage-mapper.interface.ts';
import type { DataStorageResponseDto, GoogleBigQueryConfigDto } from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { DataStorageType } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export class GoogleBigQueryMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage {
    const config = dto.config as GoogleBigQueryConfigDto | null;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.GOOGLE_BIGQUERY,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      config: {
        projectId: config?.projectId ?? '',
        location: config?.location ?? '',
      },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    return {
      config: {
        projectId: (formData.config as GoogleBigQueryConfigDto).projectId,
        location: (formData.config as GoogleBigQueryConfigDto).location,
      },
    };
  }
}
