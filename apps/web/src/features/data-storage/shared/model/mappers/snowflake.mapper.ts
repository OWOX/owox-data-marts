import type { StorageMapper } from './storage-mapper.interface.ts';
import type { DataStorageResponseDto, SnowflakeConfigDto } from '../../api/types';
import { DataStorageType } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';
import type { SnowflakeDataStorage } from '../types/data-storage.ts';

export class SnowflakeMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): SnowflakeDataStorage {
    const config = dto.config as SnowflakeConfigDto | undefined;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.SNOWFLAKE,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      config: config
        ? {
            account: config.account,
            warehouse: config.warehouse,
          }
        : {
            account: '',
            warehouse: '',
          },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    return {
      config: {
        account: (formData.config as SnowflakeConfigDto).account,
        warehouse: (formData.config as SnowflakeConfigDto).warehouse,
      },
    };
  }
}
