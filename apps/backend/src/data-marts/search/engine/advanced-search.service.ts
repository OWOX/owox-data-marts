import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';
import { VECTOR_SEARCH_PORT, VectorSearchPort } from './vector-search.port';
import {
  SearchableEntityType,
  type SearchEngine,
  type SearchOptions,
  type SearchResult,
} from '../../../common/search/search.facade';

@Injectable()
export class AdvancedSearchService implements SearchEngine {
  private readonly logger = new Logger(AdvancedSearchService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    @Inject(ADVANCED_SEARCH_CONFIG) private readonly config: AdvancedSearchConfig,
    private readonly registry: IndexableSourceRegistry,
    @Inject(VECTOR_SEARCH_PORT) private readonly vectorSearch: VectorSearchPort
  ) {}

  async search(projectId: string, prompt: string, options: SearchOptions): Promise<SearchResult[]> {
    if (!options?.accessScope) {
      throw new Error('Search accessScope is required');
    }

    const start = performance.now();

    const requestedTypes = options.entityTypes ?? Object.values(SearchableEntityType);
    const activeTypes = requestedTypes.filter(t => this.registry.has(t));

    if (activeTypes.length === 0) return [];

    const promptVecs = await this.provider.embed([prompt], { inputType: 'search_query' });
    const promptVec = promptVecs[0] ?? null;
    if (promptVec === null) {
      this.logger.warn(
        `advanced-search prompt embedding unavailable; search skipped projectId=${projectId}`
      );
      return [];
    }

    const topK = options.topK ?? this.config.topK;
    const minRelevance = this.config.minRelevance;

    const searchOptions = {
      topK,
      minRelevance,
      candidateLimit: this.config.candidateLimit,
      vectorCandidateLimit: this.config.vectorCandidateMultiplier * topK,
      accessScope: options.accessScope,
      excludeDrafts: options.excludeDrafts,
    };

    const perTypeResults = await Promise.all(
      activeTypes.map(entityType =>
        this.vectorSearch.search(entityType, projectId, prompt, promptVec, searchOptions)
      )
    );

    const all = perTypeResults
      .flat()
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topK);

    const durationMs = Math.round(performance.now() - start);
    const DEBUG_ROWS_CAP = 50;
    this.logger.debug({
      msg: 'search complete',
      projectId,
      durationMs,
      totalRows: all.length,
      minRelevance,
      loggedRows: Math.min(all.length, DEBUG_ROWS_CAP),
      scoringTable: all.slice(0, DEBUG_ROWS_CAP).map(r => ({
        entityId: r.entityId,
        title: r.title,
        finalScore: r.finalScore,
        relevance: r.relevance,
      })),
    });

    return all.map(r => ({
      entityType: r.entityType,
      entityId: r.entityId,
      title: r.title,
      description: r.description,
      finalScore: r.finalScore,
      kwScore: r.kwScore,
      vecScore: r.vecScore,
      extendability: r.extendability,
    }));
  }
}
