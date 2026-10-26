import type { StorageMapper } from './storage-mapper.interface.ts';
import type { DataStorageResponseDto, DatabricksConfigDto } from '../../api/types';
import { DataStorageType } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';
import type { DatabricksDataStorage } from '../types/data-storage.ts';

export class DatabricksMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DatabricksDataStorage {
    const config = dto.config as DatabricksConfigDto | undefined;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.DATABRICKS,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      config: config
        ? {
            host: config.host,
            httpPath: config.httpPath,
          }
        : {
            host: '',
            httpPath: '',
          },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    return {
      config: {
        host: (formData.config as DatabricksConfigDto).host,
        httpPath: (formData.config as DatabricksConfigDto).httpPath,
      },
    };
  }
}
