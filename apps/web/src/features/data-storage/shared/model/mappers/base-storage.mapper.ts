import type { DataStorageListItemResponseDto } from '../../api/types';
import type { DataStorageListItem } from '../types/data-storage-list.ts';
import type { DataStorage } from '../types/data-storage.ts';

export function mapDataStorageListFromDto(
  dto: DataStorageListItemResponseDto
): DataStorageListItem {
  return {
    id: dto.id,
    type: dto.type,
    title: dto.title,
    createdAt: new Date(dto.createdAt),
    modifiedAt: new Date(dto.modifiedAt),
  };
}

export function mapToCreateDataStorageRequest(dataStorageType: DataStorage['type']) {
  return {
    type: dataStorageType,
  };
}
