import { Injectable } from '@nestjs/common';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftConfigSchema } from '../schemas/redshift-config.schema';
import { RedshiftCredentialsSchema } from '../schemas/redshift-credentials.schema';

@Injectable()
export class RedshiftAccessValidator implements DataStorageAccessValidator {
  readonly type = DataStorageType.AWS_REDSHIFT;

  constructor(private readonly adapterFactory: RedshiftApiAdapterFactory) {}

  async validate(
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const configResult = RedshiftConfigSchema.safeParse(config);
    if (!configResult.success) {
      return new ValidationResult(false, 'Invalid config', {
        errors: configResult.error.errors,
      });
    }

    const credentialsResult = RedshiftCredentialsSchema.safeParse(credentials);
    if (!credentialsResult.success) {
      return new ValidationResult(false, 'Invalid credentials', {
        errors: credentialsResult.error.errors,
      });
    }

    const adapter = this.adapterFactory.create(credentialsResult.data, configResult.data);

    try {
      await adapter.checkAccess();
      return new ValidationResult(true);
    } catch (error) {
      return new ValidationResult(false, 'Access validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
