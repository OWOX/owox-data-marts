import type { DataStorageListItemResponseDto } from '../../api/types';
import type { DataStorageListItem } from '../types/data-storage-list.ts';
import type { DataStorageType } from '../types/data-storage-type.enum.ts';

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

export function mapToCreateDataStorageRequest(dataStorageType: DataStorageType) {
  return {
    type: dataStorageType,
  };
}
