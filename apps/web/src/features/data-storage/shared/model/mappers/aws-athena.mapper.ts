import type { StorageMapper } from './storage-mapper.interface.ts';
import type {
  AwsAthenaConfigDto,
  AwsAthenaCredentialsDto,
  DataStorageResponseDto,
} from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { type AwsAthenaCredentials, DataStorageType } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export class AwsAthenaMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage {
    const config = dto.config as AwsAthenaConfigDto | null;
    const credentials = dto.credentials as AwsAthenaCredentialsDto | null;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.AWS_ATHENA,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      credentials: {
        accessKeyId: credentials?.accessKeyId ?? '',
        secretAccessKey: credentials?.secretAccessKey ?? '',
      },
      config: {
        databaseName: config?.databaseName ?? '',
        region: config?.region ?? '',
        outputBucket: config?.outputBucket ?? '',
      },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    const result: {
      credentials?: AwsAthenaCredentialsDto;
      config: AwsAthenaConfigDto;
    } = {
      config: {
        databaseName: (formData.config as AwsAthenaConfigDto).databaseName,
        region: (formData.config as AwsAthenaConfigDto).region,
        outputBucket: (formData.config as AwsAthenaConfigDto).outputBucket,
      },
    };

    if (formData.credentials) {
      result.credentials = {
        accessKeyId: (formData.credentials as AwsAthenaCredentials).accessKeyId,
        secretAccessKey: (formData.credentials as AwsAthenaCredentials).secretAccessKey,
      };
    }

    return result;
  }
}
