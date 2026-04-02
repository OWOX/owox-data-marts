import { Inject, Injectable } from '@nestjs/common';
import { TypeResolver } from '../../../common/resolver/type-resolver';
import { BLENDED_QUERY_BUILDER_RESOLVER } from '../data-storage-providers';
import { DataStorageType } from '../enums/data-storage-type.enum';
import {
  BlendedQueryBuilder,
  ResolvedRelationshipChain,
} from '../interfaces/blended-query-builder.interface';

@Injectable()
export class BlendedQueryBuilderFacade {
  constructor(
    @Inject(BLENDED_QUERY_BUILDER_RESOLVER)
    private readonly resolver: TypeResolver<DataStorageType, BlendedQueryBuilder>
  ) {}

  async buildBlendedQuery(
    storageType: DataStorageType,
    mainTableReference: string,
    chains: ResolvedRelationshipChain[],
    columns: string[]
  ): Promise<string> {
    const builder = await this.resolver.resolve(storageType);
    return builder.buildBlendedQuery(mainTableReference, chains, columns);
  }
}
