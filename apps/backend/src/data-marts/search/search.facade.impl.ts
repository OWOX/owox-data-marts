import { Inject, Injectable } from '@nestjs/common';
import {
  SEARCH_SEMANTIC_ENGINE,
  SearchEngine,
  SearchFacade,
  SearchOptions,
  SearchResult,
} from '../../common/search/search.facade';

@Injectable()
export class SearchFacadeImpl implements SearchFacade {
  constructor(
    @Inject(SEARCH_SEMANTIC_ENGINE)
    private readonly engine: SearchEngine
  ) {}

  search(projectId: string, prompt: string, options: SearchOptions): Promise<SearchResult[]> {
    return this.engine.search(projectId, prompt, options);
  }
}
