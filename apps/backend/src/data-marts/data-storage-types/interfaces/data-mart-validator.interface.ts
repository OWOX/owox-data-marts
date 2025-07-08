import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';

export interface DataMartValidator {
  readonly type: DataStorageType;
  validate(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult>;
}

export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly errorMessage?: string,
    public readonly details?: Record<string, unknown>,
    public readonly reason?: Record<string, unknown>
  ) {}

  static success(details?: Record<string, unknown>): ValidationResult {
    return new ValidationResult(true, undefined, details);
  }

  static failure(
    errorMessage?: string,
    details?: Record<string, unknown>,
    reason?: Record<string, unknown>
  ): ValidationResult {
    return new ValidationResult(false, errorMessage, details, reason);
  }
}
