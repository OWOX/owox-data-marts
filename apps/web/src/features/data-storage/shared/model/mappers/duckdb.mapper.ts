import type { StorageMapper } from './storage-mapper.interface.ts';
import type { DataStorageResponseDto } from '../../api/types';
import { DataStorageType } from '../types';
import type { DuckDbDataStorage } from '../types/data-storage.ts';

export class DuckDbMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DuckDbDataStorage {
    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.DUCKDB,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      config: {},
      databasePath: dto.databasePath,
    };
  }

  mapToUpdateRequest() {
    return { config: {} };
  }
}
