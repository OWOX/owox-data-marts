import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { DataMartDefinition } from '../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DATA_MART_QUERY_BUILDER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  DataMartQueryBuilder,
  DataMartQueryBuilderAsync,
  DataMartQueryOptions,
} from '../interfaces/data-mart-query-builder.interface';

@Injectable()
export class DataMartQueryBuilderFacade {
  constructor(
    @Inject(DATA_MART_QUERY_BUILDER_RESOLVER)
    private readonly resolver: TypeResolver<
      DataStorageType,
      DataMartQueryBuilder | DataMartQueryBuilderAsync
    >
  ) {}

  async buildQuery(
    storageType: DataStorageType,
    definition: DataMartDefinition,
    queryOptions?: DataMartQueryOptions
  ): Promise<string> {
    const builder = await this.resolver.resolve(storageType);
    return builder.buildQuery(definition, queryOptions);
  }
}
