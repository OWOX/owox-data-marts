import { Inject, Injectable } from '@nestjs/common';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { INDEXABLE_SOURCES, type IndexableSource } from './indexable-source.port';

@Injectable()
export class IndexableSourceRegistry {
  private readonly byEntityType: Map<SearchableEntityType, IndexableSource>;

  constructor(@Inject(INDEXABLE_SOURCES) sources: IndexableSource[]) {
    this.byEntityType = new Map(sources.map(source => [source.entityType, source]));
  }

  all(): IndexableSource[] {
    return [...this.byEntityType.values()];
  }

  resolve(entityType: SearchableEntityType): IndexableSource | undefined {
    return this.byEntityType.get(entityType);
  }

  has(entityType: SearchableEntityType): boolean {
    return this.byEntityType.has(entityType);
  }
}
