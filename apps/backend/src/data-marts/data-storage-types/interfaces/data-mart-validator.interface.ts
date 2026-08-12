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

/**
 * Stable identifiers for validation failures whose message this codebase
 * authored, and which are therefore safe to show end users.
 *
 * Consumers that sanitize error text (see PublishDataStorageDraftsService)
 * allowlist these codes. A failure with no code may carry raw driver output —
 * a warehouse dry-run error, a Databricks EXPLAIN message — and must not be
 * echoed back to the browser.
 */
export enum DataMartValidationCode {
  INVALID_IDENTIFIER_FORMAT = 'DATA_MART_INVALID_IDENTIFIER_FORMAT',
  DEFINITION_NOT_FOUND = 'DATA_MART_DEFINITION_NOT_FOUND',
  STORAGE_CONFIG_NOT_FOUND = 'DATA_MART_STORAGE_CONFIG_NOT_FOUND',
  STORAGE_CREDENTIALS_NOT_FOUND = 'DATA_MART_STORAGE_CREDENTIALS_NOT_FOUND',
}

export class ValidationResult {
  constructor(
    public readonly valid: boolean,
    public readonly errorMessage?: string,
    public readonly details?: Record<string, unknown>,
    public readonly reason?: Record<string, unknown>,
    public readonly code?: DataMartValidationCode
  ) {}

  static success(details?: Record<string, unknown>): ValidationResult {
    return new ValidationResult(true, undefined, details);
  }

  /**
   * Failure carrying a message of unknown provenance — it may come from a
   * storage driver. Left uncoded so sanitizing consumers replace it.
   */
  static failure(
    errorMessage?: string,
    details?: Record<string, unknown>,
    reason?: Record<string, unknown>
  ): ValidationResult {
    return new ValidationResult(false, errorMessage, details, reason);
  }

  /** Failure whose message this codebase authored; safe to show end users. */
  static authoredFailure(
    code: DataMartValidationCode,
    errorMessage: string,
    details?: Record<string, unknown>
  ): ValidationResult {
    return new ValidationResult(false, errorMessage, details, undefined, code);
  }
}
