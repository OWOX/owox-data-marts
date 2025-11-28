import type { StorageMapper } from './storage-mapper.interface.ts';
import type {
  DataStorageResponseDto,
  SnowflakeConfigDto,
  SnowflakeCredentialsDto,
} from '../../api/types';
import { DataStorageType, type SnowflakeCredentials, SnowflakeAuthMethod } from '../types';
import type { DataStorageFormData } from '../../types/data-storage.schema.ts';
import type { SnowflakeDataStorage } from '../types/data-storage.ts';

export class SnowflakeMapper implements StorageMapper {
  mapFromDto(dto: DataStorageResponseDto): SnowflakeDataStorage {
    const config = dto.config as SnowflakeConfigDto | undefined;
    const credentials = dto.credentials as SnowflakeCredentialsDto | undefined;

    const mappedCredentials: SnowflakeCredentials | undefined = credentials
      ? credentials.authMethod === 'KEY_PAIR'
        ? {
            authMethod: SnowflakeAuthMethod.KEY_PAIR,
            username: credentials.username ?? '',
            privateKey: credentials.privateKey ?? '',
            privateKeyPassphrase: credentials.privateKeyPassphrase,
          }
        : {
            authMethod: SnowflakeAuthMethod.PASSWORD,
            username: credentials.username ?? '',
            password: credentials.password ?? '',
          }
      : undefined;

    return {
      id: dto.id,
      title: dto.title,
      type: DataStorageType.SNOWFLAKE,
      createdAt: new Date(dto.createdAt),
      modifiedAt: new Date(dto.modifiedAt),
      credentials: mappedCredentials ?? {
        authMethod: SnowflakeAuthMethod.PASSWORD,
        username: '',
        password: '',
      },
      config: config
        ? {
            account: config.account,
            warehouse: config.warehouse,
          }
        : {
            account: '',
            warehouse: '',
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
