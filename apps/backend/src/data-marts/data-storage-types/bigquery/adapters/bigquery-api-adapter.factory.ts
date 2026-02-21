import { Injectable } from '@nestjs/common';
import { BigQueryApiAdapter } from './bigquery-api.adapter';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';

/**
 * Factory for creating BigQuery API adapters.
 * Accepts either Service Account or pre-resolved OAuth credentials.
 * OAuth resolution happens upstream in DataStorageCredentialsResolver.
 */
@Injectable()
export class BigQueryApiAdapterFactory {
  create(credentials: BigQueryCredentials, config: BigQueryConfig): BigQueryApiAdapter {
    return new BigQueryApiAdapter(credentials, config);
  }
}
