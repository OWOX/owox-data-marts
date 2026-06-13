import { Injectable } from '@nestjs/common';
import type {
  AdvancedSearchFacade,
  AdvancedSearchOptions,
  SearchResult,
} from '../../../common/ee-contracts/advanced-search.facade';
import { AdvancedSearchService } from '../search/advanced-search.service';
import { SearchIndexerService } from '../indexing/search-indexer.service';

@Injectable()
export class AdvancedSearchFacadeImpl implements AdvancedSearchFacade {
  constructor(
    private readonly searchService: AdvancedSearchService,
    private readonly indexerService: SearchIndexerService
  ) {}

  search(
    projectId: string,
    prompt: string,
    options?: AdvancedSearchOptions
  ): Promise<SearchResult[]> {
    return this.searchService.search(projectId, prompt, options);
  }

  reindexDataMart(dataMartId: string): Promise<void> {
    return this.indexerService.reindexDataMart(dataMartId);
  }
}
