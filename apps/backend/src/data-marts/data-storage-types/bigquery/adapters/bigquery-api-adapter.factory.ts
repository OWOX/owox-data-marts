import { Injectable } from '@nestjs/common';
import { BigQueryApiAdapter } from './bigquery-api.adapter';
import {
  BigQueryCredentials,
  BigQueryServiceAccountCredentialsSchema,
  BigQueryOAuthCredentialsSchema,
} from '../schemas/bigquery-credentials.schema';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';
import { DataStorage } from '../../../entities/data-storage.entity';

@Injectable()
export class BigQueryApiAdapterFactory {
  constructor(private readonly credentialsResolver: DataStorageCredentialsResolver) {}

  create(credentials: BigQueryCredentials, config: BigQueryConfig): BigQueryApiAdapter {
    return new BigQueryApiAdapter(credentials, config);
  }

  async createFromStorage(
    storage: DataStorage,
    config: BigQueryConfig
  ): Promise<BigQueryApiAdapter> {
    const resolved = await this.credentialsResolver.resolve(storage);
    const saParsed = BigQueryServiceAccountCredentialsSchema.safeParse(resolved);
    const oauthParsed = BigQueryOAuthCredentialsSchema.safeParse(resolved);
    if (!saParsed.success && !oauthParsed.success) {
      throw new Error('Google BigQuery credentials are not properly configured');
    }
    const credentials: BigQueryCredentials = saParsed.success ? saParsed.data : oauthParsed.data!;
    return new BigQueryApiAdapter(credentials, config);
  }
}
