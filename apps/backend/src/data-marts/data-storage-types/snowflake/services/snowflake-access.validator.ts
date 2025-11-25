import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { SnowflakeConfigSchema } from '../schemas/snowflake-config.schema';
import { SnowflakeCredentialsSchema } from '../schemas/snowflake-credentials.schema';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { SnowflakeApiAdapter } from '../adapters/snowflake-api.adapter';

@Injectable()
export class SnowflakeAccessValidator implements DataStorageAccessValidator {
  private readonly logger = new Logger(SnowflakeAccessValidator.name);
  readonly type = DataStorageType.SNOWFLAKE;

  async validate(
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const configOpt = SnowflakeConfigSchema.safeParse(config);
    if (!configOpt.success) {
      this.logger.warn('Invalid config', configOpt.error);
      return new ValidationResult(false, 'Invalid config', { errors: configOpt.error.errors });
    }

    const credentialsOpt = SnowflakeCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const snowflakeConfig = configOpt.data;
    const apiAdapter = new SnowflakeApiAdapter(credentialsOpt.data, snowflakeConfig);
    try {
      await apiAdapter.checkAccess();
      await apiAdapter.destroy();
      return new ValidationResult(true);
    } catch (error) {
      this.logger.warn('Access validation failed', error);
      try {
        await apiAdapter.destroy();
      } catch {
        // Ignore errors during cleanup
      }
      return new ValidationResult(false, 'Access validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
