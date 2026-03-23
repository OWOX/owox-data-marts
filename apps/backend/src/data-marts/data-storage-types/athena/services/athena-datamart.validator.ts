import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { AthenaQueryBuilder } from './athena-query.builder';
import {
  isConnectorDefinition,
  isTableDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { isValidAthenaFullyQualifiedName } from '../utils/athena-validation.utils';

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

      const query = this.athenaQueryBuilder.buildQuery(definition);
      await adapter.executeDryRunQuery(query, config.outputBucket);

      return ValidationResult.success();
    } catch (error) {
      this.logger.log('Athena dry run failed', error);
      return ValidationResult.failure(error instanceof Error ? error.message : String(error));
    }
  }

  private validateIdentifiers(definition: DataMartDefinition): ValidationResult {
    let identifierToValidate: string | undefined;

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      identifierToValidate = definition.fullyQualifiedName;
    } else if (isConnectorDefinition(definition)) {
      identifierToValidate = definition.connector.storage.fullyQualifiedName;
    }

    if (identifierToValidate && !isValidAthenaFullyQualifiedName(identifierToValidate)) {
      return new ValidationResult(
        false,
        'Invalid identifier format. Expected: database.table or catalog.database.table'
      );
    }

    return new ValidationResult(true);
  }
}
