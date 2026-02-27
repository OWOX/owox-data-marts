import { Injectable } from '@nestjs/common';
import { S3ApiAdapter } from './s3-api.adapter';
import { AthenaCredentials } from '../schemas/athena-credentials.schema';
import { AthenaConfig } from '../schemas/athena-config.schema';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorage } from '../../../entities/data-storage.entity';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';

@Injectable()
export class S3ApiAdapterFactory {
  constructor(private readonly credentialsResolver: DataStorageCredentialsResolver) {}

  create(credentials: AthenaCredentials, config: AthenaConfig): S3ApiAdapter {
    return new S3ApiAdapter(credentials, config);
  }

  async createFromStorage(storage: DataStorage): Promise<S3ApiAdapter> {
    const resolved = await this.credentialsResolver.resolve(storage);
    if (!isAthenaCredentials(resolved)) {
      throw new Error('Athena credentials are not properly configured');
    }
    return new S3ApiAdapter(resolved, storage.config as AthenaConfig);
  }
}
