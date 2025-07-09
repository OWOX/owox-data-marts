import type { DataMartListResponseDto } from '../../../shared/types/api';
import type { DataMartListItem } from '../types';
import { DataMartStatusModel } from '../../../shared';

export function mapDataMartListFromDto(datamartsDto: DataMartListResponseDto): DataMartListItem[] {
  return datamartsDto.map(dmart => ({
    id: dmart.id,
    title: dmart.title,
    status: DataMartStatusModel.getInfo(dmart.status),
    storageType: dmart.storage.type,
    storageTitle: dmart.storage.title || undefined,
    definitionType: dmart.definitionType,
    createdAt: new Date(dmart.createdAt),
    modifiedAt: new Date(dmart.modifiedAt),
  }));
}
