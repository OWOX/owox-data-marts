import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AthenaConfigSchema } from '../schemas/athena-config.schema';
import { AthenaCredentialsSchema } from '../schemas/athena-credentials.schema';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../../interfaces/data-storage-access-validator.interface';
import { DataStorageConfig } from '../../data-storage-config.type';

@Injectable()
export class AthenaAccessValidator implements DataStorageAccessValidator {
  private readonly logger = new Logger(AthenaAccessValidator.name);
  readonly type = DataStorageType.AWS_ATHENA;

  async validate(
    config: DataStorageConfig,
    credentials: Record<string, unknown>
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

    // Todo implement real validation

    return new ValidationResult(true);
  }
}
