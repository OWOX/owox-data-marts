import type { StorageMapper } from './storage-mapper.interface.ts';
import type {
  DataStorageResponseDto,
  DatabricksConfigDto,
  DatabricksCredentialsDto,
} from '../../api/types';
import { DataStorageType, type DatabricksCredentials, DatabricksAuthMethod } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';
import type { DatabricksDataStorage } from '../types/data-storage.ts';

export class DatabricksMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DatabricksDataStorage {
    const config = dto.config as DatabricksConfigDto | undefined;
    const credentials = dto.credentials as DatabricksCredentialsDto | undefined;

    const mappedCredentials: DatabricksCredentials | undefined = credentials
      ? {
          authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
          token: credentials.token ?? '',
        }
      : undefined;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.DATABRICKS,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      credentials: mappedCredentials ?? {
        authMethod: DatabricksAuthMethod.PERSONAL_ACCESS_TOKEN,
        token: '',
      },
      config: config
        ? {
            host: config.host,
            httpPath: config.httpPath,
          }
        : {
            host: '',
            httpPath: '',
          },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    const result: {
      credentials?: DatabricksCredentialsDto;
      config: DatabricksConfigDto;
    } = {
      config: {
        host: (formData.config as DatabricksConfigDto).host,
        httpPath: (formData.config as DatabricksConfigDto).httpPath,
      },
    };

    if (formData.credentials) {
      const creds = formData.credentials as DatabricksCredentials;
      result.credentials = {
        authMethod: creds.authMethod,
        token: creds.token,
      };
    }

    return result;
  }
}
