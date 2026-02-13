import type { DataMartResponseDto } from '../../../shared';
import { DataMartStatusModel } from '../../../shared';
import type { DataMartListItem } from '../types';

export function mapDataMartListFromDto(datamartsDto: DataMartResponseDto[]): DataMartListItem[] {
  return datamartsDto.map(dmart => ({
    id: dmart.id,
    title: dmart.title,
    status: DataMartStatusModel.getInfo(dmart.status),
    storageType: dmart.storage.type,
    storageTitle: dmart.storage.title || undefined,
    definitionType: dmart.definitionType,
    triggersCount: dmart.triggersCount,
    reportsCount: dmart.reportsCount,
    createdByUser: dmart.createdByUser,
    createdAt: new Date(dmart.createdAt),
    modifiedAt: new Date(dmart.modifiedAt),
    definition: dmart.definition,
  }));
}
