import type { StorageMapper } from './storage-mapper.interface.ts';
import type { AwsAthenaConfigDto, DataStorageResponseDto } from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { DataStorageType } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export class AwsAthenaMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage {
    const config = dto.config as AwsAthenaConfigDto | null;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.AWS_ATHENA,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      createdByUser: dto.createdByUser,
      ownerUsers: dto.ownerUsers ?? [],
      config: {
        region: config?.region ?? '',
        outputBucket: config?.outputBucket ?? '',
      },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    return {
      config: {
        region: (formData.config as AwsAthenaConfigDto).region,
        outputBucket: (formData.config as AwsAthenaConfigDto).outputBucket,
      },
    };
  }
}
