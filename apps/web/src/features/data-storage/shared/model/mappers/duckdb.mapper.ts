import type { StorageMapper } from './storage-mapper.interface.ts';
import type {
  DuckDbConfigDto,
  DuckDbCredentialsDto,
  DataStorageResponseDto,
} from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { DataStorageType } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export class DuckDbMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage {
    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.DUCKDB,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      credentials: {},
      config: {},
      databasePath: dto.databasePath,
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    const result: {
      credentials?: DuckDbCredentialsDto;
      config: DuckDbConfigDto;
    } = {
      config: {},
    };

    if (formData.credentials) {
      result.credentials = {};
    }

    return result;
  }
}
