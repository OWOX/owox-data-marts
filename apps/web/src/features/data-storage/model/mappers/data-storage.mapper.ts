import type { DataStorageListItemResponseDto, DataStorageResponseDto } from '../../api/types';
import { DataStorageType } from '../types/data-storage-type.enum.ts';
import type {
  AwsAthenaDataStorage,
  DataStorage,
  GoogleBigQueryDataStorage,
} from '../types/data-storage.ts';
import type { DataStorageListItem } from '../types/data-storage-list.ts';

export function mapDataStorageListFromDto(
  dto: DataStorageListItemResponseDto
): DataStorageListItem {
  return {
    id: dto.title,
    type: dto.type,
    title: dto.title,
  };
}
export function mapDataStorageFromDto(dto: DataStorageResponseDto) {
  const baseStorage = {
    id: dto.id,
    title: dto.title,
    type: dto.type,
    createdAt: new Date(dto.createdAt),
    modifiedAt: new Date(dto.modifiedAt),
  };

  switch (dto.type) {
    case DataStorageType.GOOGLE_BIGQUERY:
      return {
        ...baseStorage,
        type: DataStorageType.GOOGLE_BIGQUERY,
        credentials: {
          serviceAccount: dto.credentials.serviceAccount,
          projectId: dto.credentials.projectId,
        },
      } as GoogleBigQueryDataStorage;

    case DataStorageType.AWS_ATHENA:
      return {
        ...baseStorage,
        type: DataStorageType.AWS_ATHENA,
        credentials: {
          accessKeyId: dto.credentials.accessKeyId,
          secretAccessKey: dto.credentials.secretAccessKey,
          region: dto.credentials.region,
        },
      } as AwsAthenaDataStorage;
    default:
      throw new Error(`Unknown data storage type: ${dto.type}`);
  }
}

export function mapToCreateDataStorageRequest(
  dataStorage: Omit<DataStorage, 'id' | 'createdAt' | 'modifiedAt'>
) {
  return {
    title: dataStorage.title,
    type: dataStorage.type,
  };
}
