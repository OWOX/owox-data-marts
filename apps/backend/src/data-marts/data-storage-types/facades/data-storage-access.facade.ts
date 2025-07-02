import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageAccessValidator } from '../interfaces/data-storage-access-validator.interface';
import { DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER } from '../data-storage-providers';
import { DataStorageConfig } from '../data-storage-config.type';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';

@Injectable()
export class DataStorageAccessFacade {
  constructor(
    @Inject(DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataStorageAccessValidator>
  ) {}

  async checkAccess(
    type: DataStorageType,
    config: DataStorageConfig,
    credentials: Record<string, unknown>
  ): Promise<void> {
    const validator = await this.resolver.resolve(type);
    const validationResult = await validator.validate(config, credentials);
    if (!validationResult.valid) {
      throw new AccessValidationException(validationResult.errorMessage!, validationResult.reason);
    }
  }
}
