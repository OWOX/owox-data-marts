import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { BigQueryConfigSchema } from '../schemas/bigquery-config.schema';
import { BigQueryCredentialsSchema } from '../schemas/bigquery-credentials.schema';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';

@Injectable()
export class BigQueryAccessValidator implements DataStorageAccessValidator {
  private readonly logger = new Logger(BigQueryAccessValidator.name);
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  async validate(
    config: DataStorageConfig,
    credentials: Record<string, unknown>
  ): Promise<ValidationResult> {
    const configOpt = BigQueryConfigSchema.safeParse(config);
    if (!configOpt.success) {
      this.logger.warn('Invalid config', configOpt.error);
      return new ValidationResult(false, 'Invalid config', { errors: configOpt.error.errors });
    }

    const credentialsOpt = BigQueryCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    // Todo implement real validation

    return new ValidationResult(true);
  }
}
