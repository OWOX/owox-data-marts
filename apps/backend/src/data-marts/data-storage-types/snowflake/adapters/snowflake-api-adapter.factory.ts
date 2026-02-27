import { Injectable } from '@nestjs/common';
import { SnowflakeApiAdapter } from './snowflake-api.adapter';
import { SnowflakeCredentials } from '../schemas/snowflake-credentials.schema';
import { SnowflakeConfig } from '../schemas/snowflake-config.schema';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorage } from '../../../entities/data-storage.entity';
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class SnowflakeApiAdapterFactory {
  constructor(private readonly credentialsResolver: DataStorageCredentialsResolver) {}

  create(credentials: SnowflakeCredentials, config: SnowflakeConfig): SnowflakeApiAdapter {
    return new SnowflakeApiAdapter(credentials, config);
  }

  async createFromStorage(storage: DataStorage): Promise<SnowflakeApiAdapter> {
    const resolved = await this.credentialsResolver.resolve(storage);
    if (!isSnowflakeCredentials(resolved)) {
      throw new Error('Snowflake credentials are not properly configured');
    }
    return new SnowflakeApiAdapter(resolved, storage.config as SnowflakeConfig);
  }
}
