import { Injectable } from '@nestjs/common';
import { S3ApiAdapter } from './s3-api.adapter';
import { AthenaCredentials } from '../schemas/athena-credentials.schema';
import { AthenaConfig } from '../schemas/athena-config.schema';

/**
 * Factory for creating S3 API adapters
 */
@Injectable()
export class S3ApiAdapterFactory {
  /**
   * Creates a new S3 API adapter
   *
   * @param credentials - Athena credentials
   * @param config - Athena configuration
   * @returns A new S3 API adapter instance
   */
  create(credentials: AthenaCredentials, config: AthenaConfig): S3ApiAdapter {
    return new S3ApiAdapter(credentials, config);
  }
}
