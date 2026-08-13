import { Injectable, Logger } from '@nestjs/common';
import {
  DataMartValidator,
  ValidationResult,
  DataMartValidationCode,
} from '../../interfaces/data-mart-validator.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorageConfig } from '../../data-storage-config.type';
import { DataStorageCredentials } from '../../data-storage-credentials.type';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftQueryBuilder } from './redshift-query.builder';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';
import { isValidRedshiftFullyQualifiedName } from '../utils/redshift-validation.utils';
import {
  isTableDefinition,
  isViewDefinition,
  isConnectorDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';

@Injectable()
export class RedshiftDataMartValidator implements DataMartValidator {
  readonly type = DataStorageType.AWS_REDSHIFT;
  private readonly logger = new Logger(RedshiftDataMartValidator.name);

  constructor(
    private readonly adapterFactory: RedshiftApiAdapterFactory,
    private readonly queryBuilder: RedshiftQueryBuilder
  ) {}

  async validate(
    dataMartDefinition: DataMartDefinition,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    // Identifiers are checked first, as in every other warehouse validator: the
    // check needs only the definition, and an unconfigured storage would
    // otherwise mask a malformed table name behind a config error the publish
    // path cannot show.
    const identifierValidation = this.validateIdentifiers(dataMartDefinition);
    if (!identifierValidation.valid) {
      return identifierValidation;
    }

    if (!isRedshiftConfig(config)) {
      return ValidationResult.failure('Incompatible data storage config');
    }

    if (!isRedshiftCredentials(credentials)) {
      return ValidationResult.failure('Incompatible data storage credentials');
    }

    if (isConnectorDefinition(dataMartDefinition)) {
      return ValidationResult.success();
    }

    const adapter = this.adapterFactory.create(credentials, config);

    try {
      const query = this.queryBuilder.buildQuery(dataMartDefinition, {
        limit: 0,
      });

      await adapter.executeDryRunQuery(query);

      return ValidationResult.success();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.logger.error(`Redshift validation error: ${errorMessage}`);

      return ValidationResult.failure(
        'Data mart validation failed: Invalid query or database error'
      );
    }
  }

  private validateIdentifiers(definition: DataMartDefinition): ValidationResult {
    let identifierToValidate: string | undefined;

    if (isTableDefinition(definition) || isViewDefinition(definition)) {
      identifierToValidate = definition.fullyQualifiedName;
    } else if (isConnectorDefinition(definition)) {
      identifierToValidate = definition.connector.storage.fullyQualifiedName;
    }

    if (identifierToValidate && !isValidRedshiftFullyQualifiedName(identifierToValidate)) {
      return ValidationResult.authoredFailure(
        DataMartValidationCode.INVALID_IDENTIFIER_FORMAT,
        'Invalid identifier format. Expected: schema.table or database.schema.table'
      );
    }

    return ValidationResult.success();
  }
}
