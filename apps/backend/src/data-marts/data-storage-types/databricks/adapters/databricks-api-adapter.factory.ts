import { Injectable } from '@nestjs/common';
import { DatabricksApiAdapter } from './databricks-api.adapter';
import { DatabricksCredentials } from '../schemas/databricks-credentials.schema';
import { DatabricksConfig } from '../schemas/databricks-config.schema';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorage } from '../../../entities/data-storage.entity';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class DatabricksApiAdapterFactory {
  constructor(private readonly credentialsResolver: DataStorageCredentialsResolver) {}

  create(credentials: DatabricksCredentials, config: DatabricksConfig): DatabricksApiAdapter {
    return new DatabricksApiAdapter(credentials, config);
  }

  async createFromStorage(storage: DataStorage): Promise<DatabricksApiAdapter> {
    const resolved = await this.credentialsResolver.resolve(storage);
    if (!isDatabricksCredentials(resolved)) {
      throw new Error('Databricks credentials are not properly configured');
    }
    return new DatabricksApiAdapter(resolved, storage.config as DatabricksConfig);
  }
}
