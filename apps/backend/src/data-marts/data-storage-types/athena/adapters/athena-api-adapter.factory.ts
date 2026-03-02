import { Injectable } from '@nestjs/common';
import { AthenaApiAdapter } from './athena-api.adapter';
import { AthenaCredentials } from '../schemas/athena-credentials.schema';
import { AthenaConfig } from '../schemas/athena-config.schema';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorage } from '../../../entities/data-storage.entity';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class AthenaApiAdapterFactory {
  constructor(private readonly credentialsResolver: DataStorageCredentialsResolver) {}

  create(credentials: AthenaCredentials, config: AthenaConfig): AthenaApiAdapter {
    return new AthenaApiAdapter(credentials, config);
  }

  async createFromStorage(storage: DataStorage): Promise<AthenaApiAdapter> {
    const resolved = await this.credentialsResolver.resolve(storage);
    if (!isAthenaCredentials(resolved)) {
      throw new Error('Athena credentials are not properly configured');
    }
    return new AthenaApiAdapter(resolved, storage.config as AthenaConfig);
  }
}
