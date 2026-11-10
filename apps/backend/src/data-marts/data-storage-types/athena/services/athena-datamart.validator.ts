import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartValidator,
  ValidationResult,
  DataMartValidationCode,
} from '../../interfaces/data-mart-validator.interface';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { isQueryBuildResult } from '../../interfaces/data-mart-query-builder.interface';
import { AthenaQueryBuilder } from './athena-query.builder';
import {
  isConnectorDefinition,
  isTableDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import {
  isValidAthenaConnectorTableName,
  isValidAthenaFullyQualifiedName,
} from '../utils/athena-validation.utils';
import { DATA_MART_ERROR_MESSAGES } from '../../../errors/data-mart-error-messages';

@Injectable()
export class AthenaDataMartValidator implements DataMartValidator {
  private readonly logger = new Logger(AthenaDataMartValidator.name);
  readonly type = DataStorageType.AWS_ATHENA;

  constructor(
    private readonly adapterFactory: AthenaApiAdapterFactory,
    private readonly athenaQueryBuilder: AthenaQueryBuilder
  ) {}

  /**
   * Validates a data mart definition against AWS Athena by performing a dry run of the generated SQL query.
   * Checks if the provided credentials and config are valid and attempts to validate the query syntax.
   *
   * @param definition - Data mart table definition
   * @param config - Data storage configuration for Athena
   * @param credentials - Credentials for Athena access
   * @returns ValidationResult indicating success or failure and error details if any
   */
  async validate(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const identifierValidation = this.validateIdentifiers(definition);
    if (!identifierValidation.valid) {
      return identifierValidation;
    }

    if (isConnectorDefinition(definition)) {
      return ValidationResult.success();
    }

    if (!isAthenaCredentials(credentials)) {
      return ValidationResult.failure('Invalid credentials');
    }
    if (!isAthenaConfig(config)) {
      return ValidationResult.failure('Invalid config');
    }
    try {
      const adapter = this.adapterFactory.create(credentials, config);

      const built = this.athenaQueryBuilder.buildQuery(definition);
      const query = isQueryBuildResult(built) ? built.sql : built;
      await adapter.executeDryRunQuery(query, config.outputBucket);

      return ValidationResult.success();
    } catch (error) {
      this.logger.log('Athena dry run failed', error);
      return ValidationResult.failure(error instanceof Error ? error.message : String(error));
    }
  }

  private validateIdentifiers(definition: DataMartDefinition): ValidationResult {
    if (
      (isTableDefinition(definition) || isViewDefinition(definition)) &&
      !isValidAthenaFullyQualifiedName(definition.fullyQualifiedName)
    ) {
      return ValidationResult.authoredFailure(
        DataMartValidationCode.INVALID_IDENTIFIER_FORMAT,
        DATA_MART_ERROR_MESSAGES.ATHENA_IDENTIFIER_INVALID
      );
    }
    if (
      isConnectorDefinition(definition) &&
      !isValidAthenaConnectorTableName(definition.connector.storage.fullyQualifiedName)
    ) {
      return ValidationResult.authoredFailure(
        DataMartValidationCode.INVALID_IDENTIFIER_FORMAT,
        DATA_MART_ERROR_MESSAGES.ATHENA_CONNECTOR_IDENTIFIER_INVALID
      );
    }

    return new ValidationResult(true);
  }
}
