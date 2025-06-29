import { Injectable } from '@nestjs/common';
import { BigQueryApiAdapter } from './bigquery-api.adapter';
import { BigQueryCredentials } from '../schemas/bigquery-credentials.schema';
import { BigQueryConfig } from '../schemas/bigquery-config.schema';

/**
 * Factory for creating BigQuery API adapters
 */
@Injectable()
export class BigQueryApiAdapterFactory {
  /**
   * Creates a new BigQuery API adapter
   *
   * @param credentials - BigQuery credentials
   * @param config - BigQuery configuration
   * @returns A new BigQuery API adapter instance
   */
  create(credentials: BigQueryCredentials, config: BigQueryConfig): BigQueryApiAdapter {
    return new BigQueryApiAdapter(credentials, config);
  }
}
