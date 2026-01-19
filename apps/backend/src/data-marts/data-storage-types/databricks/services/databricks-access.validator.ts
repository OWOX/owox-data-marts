import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DatabricksConfigSchema } from '../schemas/databricks-config.schema';
import { DatabricksCredentialsSchema } from '../schemas/databricks-credentials.schema';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';

@Injectable()
export class DatabricksAccessValidator implements DataStorageAccessValidator {
  private readonly logger = new Logger(DatabricksAccessValidator.name);
  readonly type = DataStorageType.DATABRICKS;

  constructor(private readonly adapterFactory: DatabricksApiAdapterFactory) {}

  async validate(
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const configOpt = DatabricksConfigSchema.safeParse(config);
    if (!configOpt.success) {
      this.logger.log('Invalid config', configOpt.error);
      return new ValidationResult(false, 'Invalid config', { errors: configOpt.error.errors });
    }

    const credentialsOpt = DatabricksCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.log('Invalid credentials', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const apiAdapter = this.adapterFactory.create(credentialsOpt.data, configOpt.data);
    try {
      await apiAdapter.checkAccess();
      await apiAdapter.destroy();
      return new ValidationResult(true);
    } catch (error) {
      this.logger.log('Access validation failed', error);
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
