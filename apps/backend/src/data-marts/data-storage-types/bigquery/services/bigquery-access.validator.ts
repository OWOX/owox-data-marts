import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { BigQueryConfigSchema } from '../schemas/bigquery-config.schema';
import {
  BIGQUERY_OAUTH_TYPE,
  BigQueryServiceAccountCredentialsSchema,
  BigQueryOAuthCredentials,
} from '../schemas/bigquery-credentials.schema';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { BigQueryApiAdapter } from '../adapters/bigquery-api.adapter';

@Injectable()
export class BigQueryAccessValidator implements DataStorageAccessValidator {
  readonly logger = new Logger(BigQueryAccessValidator.name);
  readonly type: DataStorageType = DataStorageType.GOOGLE_BIGQUERY;

  async validate(
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const configOpt = BigQueryConfigSchema.safeParse(config);
    if (!configOpt.success) {
      this.logger.warn('Invalid config', configOpt.error);
      return new ValidationResult(false, 'Invalid config', { errors: configOpt.error.errors });
    }

    const bigQueryConfig = configOpt.data;

    if ((credentials as BigQueryOAuthCredentials).type === BIGQUERY_OAUTH_TYPE) {
      const apiAdapter = new BigQueryApiAdapter(
        credentials as BigQueryOAuthCredentials,
        bigQueryConfig
      );
      try {
        await apiAdapter.checkAccess();
        return new ValidationResult(true);
      } catch (error) {
        this.logger.warn('OAuth access validation failed', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new ValidationResult(false, errorMessage);
      }
    }

    const credentialsOpt = BigQueryServiceAccountCredentialsSchema.safeParse(credentials);
    if (!credentialsOpt.success) {
      this.logger.warn('Invalid credentials', credentialsOpt.error);
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsOpt.error.errors,
      });
    }

    const apiAdapter = new BigQueryApiAdapter(credentialsOpt.data, bigQueryConfig);
    try {
      await apiAdapter.checkAccess();
      return new ValidationResult(true);
    } catch (error) {
      this.logger.warn('Access validation failed', error);
      return new ValidationResult(false, 'Access validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
