import { Inject, Injectable } from '@nestjs/common';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageConfig } from '../data-storage-config.type';
import { DataStorageCredentials } from '../data-storage-credentials.type';
import { DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  DataStorageAccessValidator,
  ValidationResult,
} from '../interfaces/data-storage-access-validator.interface';

@Injectable()
export class DataStorageAccessValidatorFacade {
  constructor(
    @Inject(DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataStorageAccessValidator>
  ) {}

  async verifyAccess(
    type: DataStorageType,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<void> {
    const validationResult = await this.validateAccess(type, config, credentials);
    if (!validationResult.valid) {
      throw new AccessValidationException(validationResult.errorMessage!, validationResult.reason);
    }
  }

  async validateAccess(
    type: DataStorageType,
    config: DataStorageConfig,
    credentials: DataStorageCredentials
  ): Promise<ValidationResult> {
    const validator = await this.resolver.resolve(type);
    return await validator.validate(config, credentials);
  }
}
