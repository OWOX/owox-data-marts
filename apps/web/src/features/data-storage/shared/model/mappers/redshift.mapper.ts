import type { StorageMapper } from './storage-mapper.interface.ts';
import type { DataStorageResponseDto, RedshiftConfigDto } from '../../api/types';
import type { RedshiftDataStorage } from '../types/data-storage.ts';
import { DataStorageType } from '../types/data-storage-type.enum';
import { RedshiftConnectionType } from '../types/data-storage-config';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';
import type { RedshiftDataStorageConfig } from '../types/data-storage-config.ts';

export class RedshiftMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): RedshiftDataStorage {
    const config = dto.config as RedshiftConfigDto | null;

    let inferredConnectionType = RedshiftConnectionType.SERVERLESS;
    if (config?.clusterIdentifier) {
      inferredConnectionType = RedshiftConnectionType.PROVISIONED;
    }

    const connectionType =
      (config?.connectionType as RedshiftConnectionType | undefined) ?? inferredConnectionType;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.AWS_REDSHIFT,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      config: config
        ? connectionType === RedshiftConnectionType.SERVERLESS
          ? {
              connectionType: RedshiftConnectionType.SERVERLESS,
              region: config.region,
              database: config.database,
              workgroupName: config.workgroupName ?? '',
            }
          : {
              connectionType: RedshiftConnectionType.PROVISIONED,
              region: config.region,
              database: config.database,
              clusterIdentifier: config.clusterIdentifier ?? '',
            }
        : {
            connectionType: RedshiftConnectionType.SERVERLESS,
            region: '',
            database: '',
            workgroupName: '',
          },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    const config = formData.config as RedshiftDataStorageConfig;

    return {
      config: {
        connectionType: config.connectionType,
        region: config.region,
        database: config.database,
        ...(config.connectionType === RedshiftConnectionType.SERVERLESS
          ? { workgroupName: config.workgroupName }
          : { clusterIdentifier: config.clusterIdentifier }),
      },
    };
  }
}
