import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AthenaConfig, AthenaConfigSchema } from '../schemas/athena-config.schema';
import { AthenaCredentialsSchema } from '../schemas/athena-credentials.schema';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';

@Injectable()
export class AthenaAccessValidator implements DataStorageAccessValidator {
  private readonly logger = new Logger(AthenaAccessValidator.name);
  readonly type = DataStorageType.AWS_ATHENA;

  constructor(private readonly adapterFactory: AthenaApiAdapterFactory) {}

  /**
   * Validates access to AWS Athena using provided configuration and credentials.
   * Checks if the configuration and credentials are valid and attempts to run a simple query to verify access.
   *
   * @param config - Data storage configuration for Athena
   * @param credentials - Credentials for Athena access
   * @returns ValidationResult indicating success or failure and error details if any
   */
  async validate(
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const configOpt = AthenaConfigSchema.safeParse(config);
    if (!configOpt.success) {
      this.logger.warn('Invalid config', configOpt.error);
      return new ValidationResult(false, 'Invalid config', { errors: configOpt.error.errors });
    }

    const credentialsOpt = AthenaCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const athenaConfig: AthenaConfig = configOpt.data;
    const apiAdapter = this.adapterFactory.create(credentialsOpt.data, athenaConfig);
    try {
      await apiAdapter.checkAccess(athenaConfig.outputBucket);
      return new ValidationResult(true);
    } catch (error) {
      this.logger.warn('Access validation failed', error);
      return new ValidationResult(false, 'Access validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
