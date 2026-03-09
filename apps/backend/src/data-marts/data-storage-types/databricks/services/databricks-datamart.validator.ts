import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { DatabricksQueryBuilder } from './databricks-query.builder';
import {
  isConnectorDefinition,
  isTableDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { isValidDatabricksFullyQualifiedName } from '../utils/databricks-validation.utils';

@Injectable()
export class DatabricksDataMartValidator implements DataMartValidator {
  private readonly logger = new Logger(DatabricksDataMartValidator.name);
  readonly type = DataStorageType.DATABRICKS;

  constructor(
    private readonly adapterFactory: DatabricksApiAdapterFactory,
    private readonly databricksQueryBuilder: DatabricksQueryBuilder
  ) {}

  async validate(
    definition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const identifierValidation = this.validateIdentifiers(definition);
    if (!identifierValidation.valid) {
      return identifierValidation;
    }

    if (!isDatabricksCredentials(credentials)) {
      return ValidationResult.failure('Invalid credentials');
    }
    if (!isDatabricksConfig(config)) {
      return ValidationResult.failure('Invalid config');
    }
    try {
      const adapter = this.adapterFactory.create(credentials, config);
      const query = this.databricksQueryBuilder.buildQuery(definition);
      const explain = await adapter.executeDryRunQuery(query);

      if (!explain.isValid) {
        this.logger.warn('Dry run validation failed', explain.error);
        await adapter.destroy();
        return ValidationResult.failure(explain.error || 'Query validation failed');
      }

      this.logger.debug('Data mart validation successful');
      await adapter.destroy();
      return ValidationResult.success();
    } catch (error) {
      this.logger.warn('Dry run failed', error);
      return ValidationResult.failure(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Validates identifiers in the data mart definition to prevent SQL injection
   * @param definition - The data mart definition
   * @returns ValidationResult indicating success or failure
   */
  private validateIdentifiers(definition: DataMartDefinition): ValidationResult {
    let identifierToValidate: string | undefined;

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      identifierToValidate = definition.fullyQualifiedName;
    } else if (isConnectorDefinition(definition)) {
      identifierToValidate = definition.connector.storage.fullyQualifiedName;
    }

    if (identifierToValidate && !isValidDatabricksFullyQualifiedName(identifierToValidate)) {
      return ValidationResult.failure('Invalid identifier format. Expected: catalog.schema.table');
    }

    return ValidationResult.success();
  }
}
