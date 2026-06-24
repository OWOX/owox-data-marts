import { Test, TestingModule } from '@nestjs/testing';
import { AdvancedSearchService } from './advanced-search.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';
import { VECTOR_SEARCH_PORT, VectorSearchPort, ScoredEntity } from './vector-search.port';
import { SearchableEntityType, type SearchOptions } from '../../../common/search/search.facade';

const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  accessScope: { userId: 'u-1', roles: ['viewer'] },
};

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    driftCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 20,
    minRelevance: 0,
    candidateLimit: 500,
    vectorCandidateMultiplier: 2,
    queryMaxLength: 256,
    embeddingConcurrency: 2,
    embeddingProvider: 'local',
    embeddingModel: 'google/gemini-embedding-2',
    embeddingDimensions: 768,
    openRouterApiKey: null,
    openRouterAllowedProviders: null,
    openRouterDataCollection: 'deny',
    openRouterZdr: true,
    openRouterBatchingEnabled: false,
    openRouterBatchSize: 20,
    openRouterRequestTimeoutMs: 60000,
    ...overrides,
  };
}

function makeScoredEntity(id: string, title: string, finalScore = 50): ScoredEntity {
  return {
    entityType: SearchableEntityType.DATA_MART,
    entityId: id,
    title,
    description: null,
    finalScore,
    kwScore: finalScore,
    vecScore: null,
    extendability: 0,
    relevance: finalScore,
  };
}

describe('AdvancedSearchService', () => {
  let service: AdvancedSearchService;
  let provider: jest.Mocked<EmbeddingProvider>;
  let registry: jest.Mocked<Pick<IndexableSourceRegistry, 'has' | 'resolve' | 'all'>>;
  let vectorSearch: jest.Mocked<VectorSearchPort>;

  const unitVec = (v: number[]): Float32Array => {
    const arr = new Float32Array(v);
    const norm = Math.sqrt(arr.reduce((s, x) => s + x * x, 0));
    return arr.map(x => x / norm) as unknown as Float32Array;
  };

  const vecA = unitVec([1, 0, 0]);

  beforeEach(async () => {
    provider = {
      modelId: 'test-model',
      embed: jest.fn().mockResolvedValue([vecA]),
    } as unknown as jest.Mocked<EmbeddingProvider>;

    registry = {
      has: jest.fn().mockImplementation(t => t === SearchableEntityType.DATA_MART),
      resolve: jest.fn().mockReturnValue(undefined),
      all: jest.fn().mockReturnValue([]),
    };

    vectorSearch = {
      search: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedSearchService,
        { provide: EMBEDDING_PROVIDER, useValue: provider },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig() },
        { provide: IndexableSourceRegistry, useValue: registry },
        { provide: VECTOR_SEARCH_PORT, useValue: vectorSearch },
      ],
    }).compile();

    service = module.get(AdvancedSearchService);
  });

  it('returns empty array when no entity types are registered', async () => {
    registry.has.mockReturnValue(false);
    const results = await service.search('proj-1', 'revenue', DEFAULT_SEARCH_OPTIONS);
    expect(results).toEqual([]);
  });

  it('returns empty without querying when entityTypes excludes DATA_MART', async () => {
    registry.has.mockReturnValue(false);
    const results = await service.search('proj-1', 'revenue', {
      ...DEFAULT_SEARCH_OPTIONS,
      entityTypes: [],
    });

    expect(results).toEqual([]);
    expect(vectorSearch.search).not.toHaveBeenCalled();
  });

  it('calls vectorSearch.search with correct entity type', async () => {
    await service.search('proj-1', 'revenue', DEFAULT_SEARCH_OPTIONS);

    expect(provider.embed).toHaveBeenCalledWith(['revenue'], { inputType: 'search_query' });
    expect(vectorSearch.search).toHaveBeenCalledWith(
      SearchableEntityType.DATA_MART,
      'proj-1',
      'revenue',
      vecA,
      expect.objectContaining({
        topK: 3,
        minRelevance: 0,
        candidateLimit: 500,
        vectorCandidateLimit: 6,
      })
    );
  });

  it('ordering: highest finalScore result first', async () => {
    vectorSearch.search.mockResolvedValue([
      makeScoredEntity('dm-b', 'Beta', 40),
      makeScoredEntity('dm-a', 'Alpha', 80),
    ]);

    const results = await service.search('proj-1', 'alpha', DEFAULT_SEARCH_OPTIONS);

    expect(results[0].entityId).toBe('dm-a');
    expect(results[1].entityId).toBe('dm-b');
  });

  it('returns empty without searching when prompt embedding is unavailable', async () => {
    provider.embed.mockResolvedValue([null]);
    vectorSearch.search.mockResolvedValue([makeScoredEntity('dm-1', 'Revenue')]);
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    const results = await service.search('proj-1', 'revenue', DEFAULT_SEARCH_OPTIONS);

    expect(results).toEqual([]);
    expect(vectorSearch.search).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('prompt embedding unavailable'));

    warnSpy.mockRestore();
  });

  it('respects topK from config', async () => {
    vectorSearch.search.mockResolvedValue([
      makeScoredEntity('a', 'A', 90),
      makeScoredEntity('b', 'B', 80),
      makeScoredEntity('c', 'C', 70),
    ]);

    const results = await service.search('proj-1', 'query', DEFAULT_SEARCH_OPTIONS);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('passes topK override to vectorSearch', async () => {
    await service.search('proj-1', 'query', { ...DEFAULT_SEARCH_OPTIONS, topK: 1 });

    expect(vectorSearch.search).toHaveBeenCalledWith(
      expect.any(String),
      'proj-1',
      'query',
      expect.anything(),
      expect.objectContaining({ topK: 1 })
    );
  });

  it('passes accessScope to vectorSearch', async () => {
    const accessScope = { userId: 'u-1', roles: ['viewer'] };
    await service.search('proj-1', 'revenue', { ...DEFAULT_SEARCH_OPTIONS, accessScope });

    expect(vectorSearch.search).toHaveBeenCalledWith(
      expect.any(String),
      'proj-1',
      'revenue',
      expect.anything(),
      expect.objectContaining({ accessScope })
    );
  });

  it('tags every result with correct entityType and entityId', async () => {
    vectorSearch.search.mockResolvedValue([makeScoredEntity('dm-1', 'Revenue')]);

    const results = await service.search('proj-1', 'revenue', DEFAULT_SEARCH_OPTIONS);

    expect(results[0].entityType).toBe(SearchableEntityType.DATA_MART);
    expect(results[0].entityId).toBe('dm-1');
  });

  it('passes minRelevance from config to vectorSearch', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedSearchService,
        { provide: EMBEDDING_PROVIDER, useValue: provider },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig({ minRelevance: 50 }) },
        { provide: IndexableSourceRegistry, useValue: registry },
        { provide: VECTOR_SEARCH_PORT, useValue: vectorSearch },
      ],
    }).compile();
    const svc = module.get(AdvancedSearchService);

    await svc.search('proj-1', 'alpha', { ...DEFAULT_SEARCH_OPTIONS, topK: 10 });

    expect(vectorSearch.search).toHaveBeenCalledWith(
      expect.any(String),
      'proj-1',
      'alpha',
      expect.anything(),
      expect.objectContaining({ minRelevance: 50 })
    );
  });

  it('fails closed when accessScope is missing', async () => {
    await expect(service.search('proj-1', 'revenue', {} as SearchOptions)).rejects.toThrow(
      'Search accessScope is required'
    );
    expect(provider.embed).not.toHaveBeenCalled();
    expect(vectorSearch.search).not.toHaveBeenCalled();
  });
});
