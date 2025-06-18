import type { DataMartListResponseDto } from '../../../shared/types/api';
import type { DataMartListItem } from '../types';

export function mapDataMartListFromDto(datamartsDto: DataMartListResponseDto): DataMartListItem[] {
  return datamartsDto.map(dmart => ({
    id: dmart.id,
    title: dmart.title,
    storageType: dmart.storageType,
    createdAt: new Date(dmart.createdAt),
    modifiedAt: new Date(dmart.modifiedAt),
  }));
}
