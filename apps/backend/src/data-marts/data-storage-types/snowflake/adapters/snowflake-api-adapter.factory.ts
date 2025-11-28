import { Injectable } from '@nestjs/common';
import { SnowflakeApiAdapter } from './snowflake-api.adapter';
import { SnowflakeCredentials } from '../schemas/snowflake-credentials.schema';
import { SnowflakeConfig } from '../schemas/snowflake-config.schema';

/**
 * Factory for creating Snowflake API adapters
 */
@Injectable()
export class SnowflakeApiAdapterFactory {
  /**
   * Creates a new Snowflake API adapter
   *
   * @param credentials - Snowflake credentials
   * @param config - Snowflake configuration
   * @returns A new Snowflake API adapter instance
   */
  create(credentials: SnowflakeCredentials, config: SnowflakeConfig): SnowflakeApiAdapter {
    return new SnowflakeApiAdapter(credentials, config);
  }
}
