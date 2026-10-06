import { ZodError } from 'zod';
import { TypedComponent } from '../../../common/resolver/typed-component.resolver';
import { describeInvalidInput, FieldErrorScope, toFieldErrors } from '../utils/field-errors.utils';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';

export enum ValidationResultCode {
  UNCONFIGURED = 'UNCONFIGURED',
  OAUTH_REAUTH_REQUIRED = 'OAUTH_REAUTH_REQUIRED',
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

  /**
   * The config or credentials failed their schema. `reason.fieldErrors` names each rejected
   * value by its request path so the storage form can highlight the input to fix;
   * `reason.errors` keeps the raw issues for existing API consumers.
   */
  static invalidInput(scope: FieldErrorScope, error: ZodError): ValidationResult {
    return new ValidationResult(false, describeInvalidInput(scope, error), {
      errors: error.errors,
      fieldErrors: toFieldErrors(scope, error),
    });
  }

  static unconfigured(errorMessage: string): ValidationResult {
    return new ValidationResult(false, errorMessage, undefined, ValidationResultCode.UNCONFIGURED);
  }

  static oauthReauthRequired(errorMessage: string): ValidationResult {
    return new ValidationResult(
      false,
      errorMessage,
      undefined,
      ValidationResultCode.OAUTH_REAUTH_REQUIRED
    );
  }
}
