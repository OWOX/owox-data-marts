import { Injectable, Logger } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  DataMartValidator,
  ValidationResult,
} from '../../interfaces/data-mart-validator.interface';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { SnowflakeQueryBuilder } from './snowflake-query.builder';
import {
  isConnectorDefinition,
  isTableDefinition,
  isViewDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { isValidSnowflakeFullyQualifiedName } from '../utils/snowflake-validation.utils';

@Injectable()
export class SnowflakeDataMartValidator implements DataMartValidator {
  private readonly logger = new Logger(SnowflakeDataMartValidator.name);
  readonly type = DataStorageType.SNOWFLAKE;

  constructor(
    private readonly adapterFactory: SnowflakeApiAdapterFactory,
    private readonly snowflakeQueryBuilder: SnowflakeQueryBuilder
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

    if (!isSnowflakeCredentials(credentials)) {
      return ValidationResult.failure('Invalid credentials');
    }
    if (!isSnowflakeConfig(config)) {
      return ValidationResult.failure('Invalid config');
    }
    try {
      const adapter = this.adapterFactory.create(credentials, config);
      const query = this.snowflakeQueryBuilder.buildQuery(definition);
      const explain = await adapter.executeDryRunQuery(query);
      const explainSummary = {
        partitionsTotal: explain?.GlobalStats?.partitionsTotal,
        partitionsAssigned: explain?.GlobalStats?.partitionsAssigned,
        bytesAssigned: explain?.GlobalStats?.bytesAssigned,
      };
      this.logger.debug(`Data mart validation successful: ${JSON.stringify(explainSummary)}`);
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

    if (identifierToValidate && !isValidSnowflakeFullyQualifiedName(identifierToValidate)) {
      return ValidationResult.failure('Invalid identifier format. Expected: database.schema.table');
    }

    return ValidationResult.success();
  }
}
