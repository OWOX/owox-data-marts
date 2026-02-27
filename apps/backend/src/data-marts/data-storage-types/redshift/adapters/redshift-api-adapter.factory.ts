import { Injectable } from '@nestjs/common';
import { RedshiftApiAdapter } from './redshift-api.adapter';
import { RedshiftCredentials } from '../schemas/redshift-credentials.schema';
import { RedshiftConfig } from '../schemas/redshift-config.schema';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorage } from '../../../entities/data-storage.entity';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class RedshiftApiAdapterFactory {
  constructor(private readonly credentialsResolver: DataStorageCredentialsResolver) {}

  create(credentials: RedshiftCredentials, config: RedshiftConfig): RedshiftApiAdapter {
    return new RedshiftApiAdapter(credentials, config);
  }

  async createFromStorage(storage: DataStorage): Promise<RedshiftApiAdapter> {
    const resolved = await this.credentialsResolver.resolve(storage);
    if (!isRedshiftCredentials(resolved)) {
      throw new Error('Redshift credentials are not properly configured');
    }
    return new RedshiftApiAdapter(resolved, storage.config as RedshiftConfig);
  }
}
