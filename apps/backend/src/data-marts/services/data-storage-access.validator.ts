import { DataStorageType } from '../enums/data-storage-type.enum';
import { TypedComponent } from '../../common/resolver/typed-component.resolver';
import { BigQueryConfigDto, BigQueryConfigSchema } from '../dto/schemas/big-query-config.schema';
import {
  BigQueryCredentialsDto,
  BigQueryCredentialsSchema,
} from '../dto/schemas/bigquery-credentials.schema';
import { AthenaConfigDto, AthenaConfigSchema } from '../dto/schemas/athena-config.schema';
import {
  AthenaCredentialsDto,
  AthenaCredentialsSchema,
} from '../dto/schemas/athena-credentials.schema';
import { Injectable, Logger } from '@nestjs/common';

export interface DataStorageAccessValidator extends TypedComponent<DataStorageType> {
  validate(
    config: Record<string, unknown>,
    credentials: Record<string, unknown>
  ): Promise<ValidationResult>;
}

export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly reason?: string
  ) {}
}

@Injectable()
export class BigQueryAccessValidator implements DataStorageAccessValidator {
  private readonly logger = new Logger(BigQueryAccessValidator.name);
  readonly type = DataStorageType.GOOGLE_BIGQUERY;

  async validate(
    config: Record<string, unknown>,
    credentials: Record<string, unknown>
  ): Promise<ValidationResult> {
    try {
      // Todo implement real validation
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const bigQueryConfig: BigQueryConfigDto = BigQueryConfigSchema.parse(config);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const bigQueryCredentials: BigQueryCredentialsDto =
        BigQueryCredentialsSchema.parse(credentials);
      return new ValidationResult(true);
    } catch (e) {
      this.logger.warn('Invalid config or credentials', e);
      return new ValidationResult(false, 'Invalid config or credentials');
    }
  }
}

@Injectable()
export class AthenaAccessValidator implements DataStorageAccessValidator {
  private readonly logger = new Logger(AthenaAccessValidator.name);
  readonly type = DataStorageType.AWS_ATHENA;

  async validate(
    config: Record<string, unknown>,
    credentials: Record<string, unknown>
  ): Promise<ValidationResult> {
    try {
      // Todo implement real validation
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const athenaConfig: AthenaConfigDto = AthenaConfigSchema.parse(config);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const athenaCredentials: AthenaCredentialsDto = AthenaCredentialsSchema.parse(credentials);

      return new ValidationResult(true);
    } catch (e) {
      this.logger.warn('Invalid config or credentials', e);
      return new ValidationResult(false, 'Invalid config or credentials');
    }
  }
}
