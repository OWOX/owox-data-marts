import { DataStorageType, toHumanReadable } from '../enums/data-storage-type.enum';
import { TypeResolver } from '../../common/resolver/type-resolver';
import { DataStorageTitleGenerator } from './data-storage-title.generator';
import { Inject, Injectable } from '@nestjs/common';
import { DATA_STORAGE_TITLE_GENERATOR_RESOLVER } from '../module-providers/data-storage-resolvers.provider';

@Injectable()
export class DataStorageTitleService {
  constructor(
    @Inject(DATA_STORAGE_TITLE_GENERATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataStorageTitleGenerator>
  ) {}

  generate(type: DataStorageType, config: Record<string, unknown> | undefined): string {
    if (!config) {
      return toHumanReadable(type);
    }
    return this.resolver.resolve(type).generateTitle(config);
  }
}
