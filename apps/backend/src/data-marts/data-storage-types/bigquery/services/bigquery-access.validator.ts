import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { BigQueryConfig, BigQueryConfigSchema } from '../schemas/bigquery-config.schema';
import {
  BigQueryCredentialsDto,
  BigQueryCredentialsSchema,
} from '../schemas/bigquery-credentials.schema';
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
    try {
      // Todo implement real validation
      const _bigQueryConfig: BigQueryConfig = BigQueryConfigSchema.parse(config);
      const _bigQueryCredentials: BigQueryCredentialsDto =
        BigQueryCredentialsSchema.parse(credentials);
      return new ValidationResult(true);
    } catch (e) {
      this.logger.warn('Invalid config or credentials', e);
      return new ValidationResult(false, 'Invalid config or credentials', e.message);
    }
  }
}
