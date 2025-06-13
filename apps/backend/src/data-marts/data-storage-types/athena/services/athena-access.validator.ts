import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { AthenaConfig, AthenaConfigSchema } from '../schemas/athena-config.schema';
import {
  AthenaCredentialsDto,
  AthenaCredentialsSchema,
} from '../schemas/athena-credentials.schema';
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
    try {
      // Todo implement real validation
      const _athenaConfig: AthenaConfig = AthenaConfigSchema.parse(config);
      const _athenaCredentials: AthenaCredentialsDto = AthenaCredentialsSchema.parse(credentials);

      return new ValidationResult(true);
    } catch (e) {
      this.logger.warn('Invalid config or credentials', e);
      return new ValidationResult(false, 'Invalid config or credentials', e.message);
    }
  }
}
