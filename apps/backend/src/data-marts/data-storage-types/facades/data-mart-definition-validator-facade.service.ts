import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataMartValidator, ValidationResult } from '../interfaces/data-mart-validator.interface';
import { DATA_MART_VALIDATOR_RESOLVER } from '../data-storage-providers';
import { isConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { DataMart } from '../../entities/data-mart.entity';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataStorageCredentialsResolver } from '../data-storage-credentials-resolver.service';

@Injectable()
export class DataMartDefinitionValidatorFacade {
  constructor(
    @Inject(DATA_MART_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataMartValidator>,
    private readonly credentialsResolver: DataStorageCredentialsResolver
  ) {}

  async validate(dataMart: DataMart): Promise<ValidationResult> {
    const definition = dataMart.definition;
    if (!definition) {
      return new ValidationResult(false, 'DataMart definition not found');
    }

    if (isConnectorDefinition(definition)) {
      return new ValidationResult(true);
    }

    const config = dataMart.storage.config;
    if (!config) {
      return new ValidationResult(false, 'DataMart storage config not found');
    }

    if (!dataMart.storage.credentialId) {
      return new ValidationResult(false, 'DataMart storage credentials not found');
    }

    const credentials = await this.credentialsResolver.resolve(dataMart.storage);

    const validator = await this.resolver.resolve(dataMart.storage.type);
    return validator.validate(definition, config, credentials);
  }

  async checkIsValid(dataMart: DataMart): Promise<void> {
    const result = await this.validate(dataMart);
    if (!result.valid) {
      throw new BusinessViolationException(result.errorMessage!, result.details);
    }
  }
}
