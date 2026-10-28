import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  DataMartValidationCode,
  DataMartValidator,
  ValidationResult,
} from '../interfaces/data-mart-validator.interface';
import {
  DATA_MART_DEFINITION_RESOLVER,
  DATA_MART_VALIDATOR_RESOLVER,
} from '../data-storage-providers';
import { DataMart } from '../../entities/data-mart.entity';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataStorageCredentialsResolver } from '../data-storage-credentials-resolver.service';
import { DataMartDefinitionResolver } from '../interfaces/data-mart-definition-resolver.interface';
import { isDataMartSqlReferenceException } from '../../sql-references/data-mart-sql-reference.errors';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';

@Injectable()
export class DataMartDefinitionValidatorFacade {
  constructor(
    @Inject(DATA_MART_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataMartValidator>,
    private readonly credentialsResolver: DataStorageCredentialsResolver,
    @Inject(DATA_MART_DEFINITION_RESOLVER)
    private readonly definitions: DataMartDefinitionResolver
  ) {}

  async validate(dataMart: DataMart): Promise<ValidationResult> {
    let definition: DataMartDefinition | undefined;
    try {
      definition = await this.definitions.resolveDefinition(dataMart);
    } catch (error) {
      // A reference to a Data Mart that is gone, in another Storage, or loops back: the message
      // names the referenced Data Mart and was written for the person editing the SQL.
      if (isDataMartSqlReferenceException(error)) {
        return ValidationResult.authoredFailure(
          DataMartValidationCode.DATA_MART_REFERENCE_INVALID,
          error.message,
          error.errorDetails
        );
      }
      throw error;
    }
    if (!definition) {
      return ValidationResult.authoredFailure(
        DataMartValidationCode.DEFINITION_NOT_FOUND,
        'DataMart definition not found'
      );
    }

    const config = dataMart.storage.config;
    if (!config) {
      return ValidationResult.authoredFailure(
        DataMartValidationCode.STORAGE_CONFIG_NOT_FOUND,
        'DataMart storage config not found'
      );
    }

    if (!(await this.credentialsResolver.hasCredentials(dataMart.storage))) {
      return ValidationResult.authoredFailure(
        DataMartValidationCode.STORAGE_CREDENTIALS_NOT_FOUND,
        'DataMart storage credentials not found'
      );
    }

    const credentials = await this.credentialsResolver.resolve(dataMart.storage);

    const validator = await this.resolver.resolve(dataMart.storage.type);
    return validator.validate(definition, config, credentials);
  }

  async checkIsValid(dataMart: DataMart): Promise<void> {
    const result = await this.validate(dataMart);
    if (!result.valid) {
      throw new BusinessViolationException(result.errorMessage!, result.details, result.code);
    }
  }
}
