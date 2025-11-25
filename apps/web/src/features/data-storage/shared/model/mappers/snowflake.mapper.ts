import type { StorageMapper } from './storage-mapper.interface.ts';
import type {
  DataStorageResponseDto,
  SnowflakeConfigDto,
  SnowflakeCredentialsDto,
} from '../../api/types';
import type { DataStorage } from '../types/data-storage.ts';
import { DataStorageType, type SnowflakeCredentials, SnowflakeAuthMethod } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';

export class SnowflakeMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): DataStorage {
    const config = dto.config as SnowflakeConfigDto | null;
    const credentials = dto.credentials as SnowflakeCredentialsDto | null;

    const mappedCredentials: SnowflakeCredentials = credentials?.authMethod === 'KEY_PAIR'
      ? {
          authMethod: SnowflakeAuthMethod.KEY_PAIR,
          username: credentials?.username ?? '',
          privateKey: credentials?.privateKey ?? '',
          privateKeyPassphrase: credentials?.privateKeyPassphrase,
        }
      : {
          authMethod: SnowflakeAuthMethod.PASSWORD,
          username: credentials?.username ?? '',
          password: credentials?.password ?? '',
        };

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.SNOWFLAKE,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      credentials: mappedCredentials,
      config: {
        account: config?.account ?? '',
        warehouse: config?.warehouse ?? '',
      },
    };
  }

  mapToUpdateRequest(formData: Partial<DataStorageFormData>) {
    const result: {
      credentials?: SnowflakeCredentialsDto;
      config: SnowflakeConfigDto;
    } = {
      config: {
        account: (formData.config as SnowflakeConfigDto).account,
        warehouse: (formData.config as SnowflakeConfigDto).warehouse,
      },
    };

    if (formData.credentials) {
      const creds = formData.credentials as SnowflakeCredentials;
      result.credentials = {
        authMethod: creds.authMethod,
        username: creds.username,
        ...(creds.authMethod === SnowflakeAuthMethod.PASSWORD
          ? { password: creds.password }
          : {
              privateKey: creds.privateKey,
              privateKeyPassphrase: creds.privateKeyPassphrase,
            }),
      };
    }

    return result;
  }
}
