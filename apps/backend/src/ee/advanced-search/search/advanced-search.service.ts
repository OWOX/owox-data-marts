import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATA_MART_CATALOG, DataMartCatalogPort } from '../catalog/data-mart-catalog.port';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { rank, IndexedVector } from './scoring';
import { bufferToVec } from '../embedding/vector-codec';
import {
  SearchableEntityType,
  type AdvancedSearchOptions,
  type SearchResult,
} from '../../../common/ee-contracts/advanced-search.facade';

const CACHE_TTL_MS = 60_000;

interface ProjectCache {
  vectors: IndexedVector[];
  maxUpdatedAt: string | null;
  loadedAt: number;
}

@Injectable()
export class AdvancedSearchService {
  private readonly logger = new Logger(AdvancedSearchService.name);
  private readonly cache = new Map<string, ProjectCache>();

  constructor(
    @Inject(DATA_MART_CATALOG) private readonly catalog: DataMartCatalogPort,
    @Inject(EMBEDDING_PROVIDER) private readonly provider: EmbeddingProvider,
    private readonly repository: SearchIndexRepository,
    @Inject(ADVANCED_SEARCH_CONFIG) private readonly config: AdvancedSearchConfig
  ) {}

  async search(
    projectId: string,
    prompt: string,
    options?: AdvancedSearchOptions
  ): Promise<SearchResult[]> {
    const start = performance.now();

    if (options?.entityTypes && !options.entityTypes.includes(SearchableEntityType.DATA_MART)) {
      return [];
    }

    const [marts, edges, vectors] = await Promise.all([
      this.catalog.listSearchable(projectId, options?.accessScope),
      this.catalog.listRelationships(projectId),
      this.resolveVectors(projectId),
    ]);

    const promptVecs = await this.provider.embed([prompt]);
    const promptVec = promptVecs[0] ?? null;

    const all = rank(marts, edges, vectors, prompt, promptVec);
    const limit = options?.topK ?? this.config.topK;
    const results = all.slice(0, limit);

    const durationMs = Math.round(performance.now() - start);

    const DEBUG_ROWS_CAP = 50;
    this.logger.debug({
      msg: 'search complete',
      projectId,
      durationMs,
      totalRows: all.length,
      loggedRows: Math.min(all.length, DEBUG_ROWS_CAP),
      scoringTable: all
        .slice(0, DEBUG_ROWS_CAP)
        .map(r => ({ dataMartId: r.dataMartId, title: r.title, finalScore: r.finalScore })),
    });

    return results.map(r => ({
      entityType: SearchableEntityType.DATA_MART,
      entityId: r.dataMartId,
      title: r.title,
      description: r.description,
      finalScore: r.finalScore,
      kwScore: r.kwScore,
      vecScore: r.vecScore,
      extendability: r.extendability,
    }));
  }

  private async resolveVectors(projectId: string): Promise<IndexedVector[]> {
    const currentMax = await this.repository.maxUpdatedAt(projectId);
    const cached = this.cache.get(projectId);
    const now = Date.now();

    if (cached && cached.maxUpdatedAt === currentMax && now - cached.loadedAt < CACHE_TTL_MS) {
      return cached.vectors;
    }

    const rows = await this.repository.listByProject(projectId);
    const vectors: IndexedVector[] = rows.map(r => ({
      dataMartId: r.dataMartId,
      vector: r.embedding ? bufferToVec(r.embedding) : null,
    }));

    this.cache.set(projectId, { vectors, maxUpdatedAt: currentMax, loadedAt: now });
    return vectors;
  }
}
