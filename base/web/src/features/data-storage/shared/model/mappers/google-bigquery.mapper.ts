import type { StorageMapper } from './storage-mapper.interface.ts';
import type {
  DataStorageResponseDto,
  GoogleBigQueryConfigDto,
  GoogleBigQueryCredentialsDto,
} from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { DataStorageType, type GoogleBigQueryCredentials } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export class GoogleBigQueryMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage {
    const config = dto.config as GoogleBigQueryConfigDto | null;
    const credentials = dto.credentials as GoogleBigQueryCredentialsDto | null;

    let serviceAccountJson = '';
    if (credentials && Object.keys(credentials).length > 0) {
      serviceAccountJson = JSON.stringify(credentials, null, 2);
    }

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.GOOGLE_BIGQUERY,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      credentials: {
        serviceAccount: serviceAccountJson,
      },
      config: {
        projectId: config?.projectId ?? '',
        location: config?.location ?? '',
      },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    const result: {
      credentials?: GoogleBigQueryCredentialsDto;
      config: GoogleBigQueryConfigDto;
    } = {
      config: {
        projectId: (formData.config as GoogleBigQueryConfigDto).projectId,
        location: (formData.config as GoogleBigQueryConfigDto).location,
      },
    };

    if (formData.credentials) {
      result.credentials = {
        ...JSON.parse((formData.credentials as GoogleBigQueryCredentials).serviceAccount),
      } as GoogleBigQueryCredentialsDto;
    }

    return result;
  }
}
