import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataStorageType, toHumanReadable } from '../enums/data-storage-type.enum';
import { DATA_STORAGE_TITLE_GENERATOR_RESOLVER } from '../data-storage-providers';
import { DataStorageTitleGenerator } from '../interfaces/data-storage-title-generator.interface';
import { DataStorageConfig } from '../data-storage-config.type';

@Injectable()
export class DataStorageTitleFacade {
  constructor(
    @Inject(DATA_STORAGE_TITLE_GENERATOR_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, DataStorageTitleGenerator>
  ) {}

  generate(type: DataStorageType, config: DataStorageConfig | undefined): string {
    if (!config) {
      return toHumanReadable(type);
    }
    return this.resolver.resolve(type).generateTitle(config);
  }
}
