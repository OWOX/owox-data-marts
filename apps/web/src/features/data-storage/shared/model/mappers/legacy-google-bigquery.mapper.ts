import type { StorageMapper } from './storage-mapper.interface.ts';
import type {
  DataStorageResponseDto,
  GoogleBigQueryConfigDto,
  GoogleBigQueryCredentialsDto,
} from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { DataStorageType, type GoogleBigQueryCredentials } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export class LegacyGoogleBigQueryMapper implements StorageMapper {
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
      type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      credentials: {
        serviceAccount: serviceAccountJson,
        credentialId: dto.credentialId,
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
      credentialId?: string | null;
    } = {
      config: {
        projectId: (formData.config as GoogleBigQueryConfigDto).projectId,
        location: (formData.config as GoogleBigQueryConfigDto).location,
      },
    };

    if (formData.credentials) {
      const creds = formData.credentials as GoogleBigQueryCredentials;
      const serviceAccount = creds.serviceAccount;
      if (serviceAccount?.trim()) {
        try {
          const parsed: unknown = JSON.parse(serviceAccount);
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Service Account must be a JSON object');
          }
          result.credentials = parsed as GoogleBigQueryCredentialsDto;
        } catch (err) {
          if (err instanceof SyntaxError) {
            throw new Error('Invalid Service Account JSON');
          }
          throw err;
        }
      }
      // null = user explicitly disconnected OAuth; pass it so backend can revoke
      if (creds.credentialId === null) {
        result.credentialId = null;
      }
    }

    return result;
  }
}
