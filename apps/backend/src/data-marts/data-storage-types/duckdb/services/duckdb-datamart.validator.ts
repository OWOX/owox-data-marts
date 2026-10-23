import { Injectable } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import {
  DataMartValidationCode,
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { isConnectorDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { isValidDuckDbFullyQualifiedName } from '../utils/duckdb-validation.utils';

@Injectable()
export class DuckDbDataMartValidator implements DataMartValidator {
  readonly type = DataStorageType.DUCKDB;

  /** Checks only the target identifier's format; no definition is run against the file here. */
  async validate(
    definition: DataMartDefinition,
    _config: DataStorageConfig,
    _credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const fqn = isConnectorDefinition(definition)
      ? definition.connector?.storage?.fullyQualifiedName
      : (definition as { fullyQualifiedName?: string }).fullyQualifiedName;

    if (fqn && !isValidDuckDbFullyQualifiedName(fqn)) {
      return ValidationResult.authoredFailure(
        DataMartValidationCode.INVALID_IDENTIFIER_FORMAT,
        'Invalid identifier format. Expected: schema.table'
      );
    }

    return ValidationResult.success();
  }
}
