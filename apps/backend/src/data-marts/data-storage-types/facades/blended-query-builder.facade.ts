import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { BLENDED_QUERY_BUILDER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  BlendedQueryBuilder,
  RoutedBlendedQueryContext,
} from '../interfaces/blended-query-builder.interface';
import { QueryBuildResult } from '../interfaces/data-mart-query-builder.interface';

@Injectable()
export class BlendedQueryBuilderFacade {
  constructor(
    @Inject(BLENDED_QUERY_BUILDER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, BlendedQueryBuilder>
  ) {}

  /**
   * `RoutedBlendedQueryContext`, not `BlendedQueryContext`: the only way production code reaches a
   * blended builder, so the clause verdict is required here.
   */
  async buildBlendedQuery(
    storageType: DataStorageType,
    context: RoutedBlendedQueryContext
  ): Promise<string | QueryBuildResult> {
    const builder = await this.resolver.resolve(storageType);
    return builder.buildBlendedQuery(context);
  }
}
