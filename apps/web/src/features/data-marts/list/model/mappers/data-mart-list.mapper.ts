import type { DataMartListItemResponseDto } from '../../../shared';
import { DataMartStatusModel } from '../../../shared';
import type { DataMartListItem } from '../types';

export function mapDataMartListFromDto(
  datamartsDto: DataMartListItemResponseDto[]
): DataMartListItem[] {
  return datamartsDto.map(dmart => ({
    id: dmart.id,
    title: dmart.title,
    status: DataMartStatusModel.getInfo(dmart.status),
    storageType: dmart.storage.type,
    storageTitle: dmart.storage.title || undefined,
    definitionType: dmart.definitionType,
    connectorSourceName: dmart.connectorSourceName,
    triggersCount: dmart.triggersCount,
    reportsCount: dmart.reportsCount,
    createdByUser: dmart.createdByUser,
    createdAt: new Date(dmart.createdAt),
    modifiedAt: new Date(dmart.modifiedAt),
  }));
}
