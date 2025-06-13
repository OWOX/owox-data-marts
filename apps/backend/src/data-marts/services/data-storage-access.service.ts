import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageType } from '../enums/data-storage-type.enum';
import { DataStorageAccessValidator } from './data-storage-access.validator';
import { DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER } from '../module-providers/data-storage-resolvers.provider';

@Injectable()
export class DataStorageAccessService {
  constructor(
    @Inject(DATA_STORAGE_ACCESS_VALIDATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataStorageAccessValidator>
  ) {}

  async checkAccess(
    type: DataStorageType,
    config: Record<string, unknown>,
    credentials: Record<string, unknown>
  ): Promise<void> {
    const validationResult = await this.resolver.resolve(type).validate(config, credentials);
    if (!validationResult.valid) {
      // TODO add custom exception
      throw new Error(validationResult.reason);
    }
  }
}
