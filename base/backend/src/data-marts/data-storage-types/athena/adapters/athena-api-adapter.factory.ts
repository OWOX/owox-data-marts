import { Injectable } from '@nestjs/common';
import { AthenaApiAdapter } from './athena-api.adapter';
import { AthenaCredentials } from '../schemas/athena-credentials.schema';
import { AthenaConfig } from '../schemas/athena-config.schema';

/**
 * Factory for creating Athena API adapters
 */
@Injectable()
export class AthenaApiAdapterFactory {
  /**
   * Creates a new Athena API adapter
   *
   * @param credentials - Athena credentials
   * @param config - Athena configuration
   * @returns A new Athena API adapter instance
   */
  create(credentials: AthenaCredentials, config: AthenaConfig): AthenaApiAdapter {
    return new AthenaApiAdapter(credentials, config);
  }
}
