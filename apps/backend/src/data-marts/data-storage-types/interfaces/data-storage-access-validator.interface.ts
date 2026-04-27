import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';

export enum ValidationResultCode {
  UNCONFIGURED = 'UNCONFIGURED',
}

export interface DataStorageAccessValidator extends TypedComponent<DataStorageType> {
  validate(
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult>;
}

export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly errorMessage?: string,
    public readonly reason?: Record<string, unknown>,
    public readonly code?: ValidationResultCode
  ) {}

  static success(): ValidationResult {
    return new ValidationResult(true);
  }

  static failure(errorMessage?: string, reason?: Record<string, unknown>): ValidationResult {
    return new ValidationResult(false, errorMessage, reason);
  }

  static unconfigured(errorMessage: string): ValidationResult {
    return new ValidationResult(false, errorMessage, undefined, ValidationResultCode.UNCONFIGURED);
  }
}
