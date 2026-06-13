import { Test, TestingModule } from '@nestjs/testing';
import { AdvancedSearchService } from './advanced-search.service';
import {
  DATA_MART_CATALOG,
  DataMartCatalogPort,
  SearchableDataMart,
} from '../catalog/data-mart-catalog.port';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { SearchableEntityType } from '../../../common/ee-contracts/advanced-search.facade';

function makeMart(id: string, title: string, fieldNames: string[] = []): SearchableDataMart {
  return {
    id,
    projectId: 'proj-1',
    title,
    description: null,
    fieldNames,
    contexts: [],
    modifiedAt: new Date('2024-01-01'),
  };
}

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    reconcileCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 20,
    ...overrides,
  };
}

describe('AdvancedSearchService', () => {
  let service: AdvancedSearchService;
  let catalog: jest.Mocked<DataMartCatalogPort>;
  let provider: jest.Mocked<EmbeddingProvider>;
  let repository: jest.Mocked<
    Pick<
      SearchIndexRepository,
      'listByProject' | 'maxUpdatedAt' | 'upsert' | 'listHashes' | 'deleteAllExcept'
    >
  >;

  const unitVec = (v: number[]): Float32Array => {
    const arr = new Float32Array(v);
    const norm = Math.sqrt(arr.reduce((s, x) => s + x * x, 0));
    return arr.map(x => x / norm) as unknown as Float32Array;
  };

  const vecA = unitVec([1, 0, 0]);
  const vecB = unitVec([0, 1, 0]);

  beforeEach(async () => {
    catalog = {
      listSearchable: jest.fn().mockResolvedValue([]),
      listRelationships: jest.fn().mockResolvedValue([]),
      listLiveIds: jest.fn().mockResolvedValue(new Set()),
    };

    provider = {
      modelId: 'test-model',
      embed: jest.fn().mockResolvedValue([vecA]),
    } as unknown as jest.Mocked<EmbeddingProvider>;

    repository = {
      listByProject: jest.fn().mockResolvedValue([]),
      maxUpdatedAt: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue(undefined),
      listHashes: jest.fn().mockResolvedValue(new Map()),
      deleteAllExcept: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvancedSearchService,
        { provide: DATA_MART_CATALOG, useValue: catalog },
        { provide: EMBEDDING_PROVIDER, useValue: provider },
        { provide: SearchIndexRepository, useValue: repository },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig() },
      ],
    }).compile();

    service = module.get(AdvancedSearchService);
  });

  it('returns empty array when no marts', async () => {
    const results = await service.search('proj-1', 'revenue');
    expect(results).toEqual([]);
  });

  it('ordering matches rank() — mart with highest vector similarity ranks first', async () => {
    const martA = makeMart('dm-a', 'Alpha');
    const martB = makeMart('dm-b', 'Beta');
    catalog.listSearchable.mockResolvedValue([martA, martB]);

    const bufA = Buffer.from(vecA.buffer);
    const bufB = Buffer.from(vecB.buffer);
    repository.listByProject.mockResolvedValue([
      { dataMartId: 'dm-a', embedding: bufA },
      { dataMartId: 'dm-b', embedding: bufB },
    ]);

    provider.embed.mockResolvedValue([vecA]);

    const results = await service.search('proj-1', 'alpha', { topK: 2 });

    expect(results[0].entityId).toBe('dm-a');
  });

  it('cache is reused when maxUpdatedAt does not change', async () => {
    const mart = makeMart('dm-1', 'Revenue');
    catalog.listSearchable.mockResolvedValue([mart]);
    repository.maxUpdatedAt.mockResolvedValue('2024-01-01T00:00:00.000Z');
    repository.listByProject.mockResolvedValue([{ dataMartId: 'dm-1', embedding: null }]);
    provider.embed.mockResolvedValue([null]);

    await service.search('proj-1', 'revenue');
    await service.search('proj-1', 'revenue');

    expect(repository.listByProject).toHaveBeenCalledTimes(1);
  });

  it('cache is invalidated when maxUpdatedAt changes', async () => {
    const mart = makeMart('dm-1', 'Revenue');
    catalog.listSearchable.mockResolvedValue([mart]);
    repository.listByProject.mockResolvedValue([{ dataMartId: 'dm-1', embedding: null }]);
    provider.embed.mockResolvedValue([null]);

    repository.maxUpdatedAt.mockResolvedValueOnce('2024-01-01T00:00:00.000Z');
    await service.search('proj-1', 'revenue');

    repository.maxUpdatedAt.mockResolvedValueOnce('2024-06-01T00:00:00.000Z');
    await service.search('proj-1', 'revenue');

    expect(repository.listByProject).toHaveBeenCalledTimes(2);
  });

  it('handles null promptVec (keyword-only path)', async () => {
    const mart = makeMart('dm-1', 'Revenue');
    catalog.listSearchable.mockResolvedValue([mart]);
    repository.listByProject.mockResolvedValue([{ dataMartId: 'dm-1', embedding: null }]);
    provider.embed.mockResolvedValue([null]);

    const results = await service.search('proj-1', 'revenue');

    expect(results).toHaveLength(1);
    expect(results[0].vecScore).toBeNull();
  });

  it('respects topK from config when not provided', async () => {
    const marts = ['a', 'b', 'c', 'd', 'e'].map(id => makeMart(id, id));
    catalog.listSearchable.mockResolvedValue(marts);
    repository.listByProject.mockResolvedValue([]);
    provider.embed.mockResolvedValue([null]);

    const results = await service.search('proj-1', 'query');
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('respects explicit topK override', async () => {
    const marts = ['a', 'b', 'c', 'd', 'e'].map(id => makeMart(id, id));
    catalog.listSearchable.mockResolvedValue(marts);
    repository.listByProject.mockResolvedValue([]);
    provider.embed.mockResolvedValue([null]);

    const results = await service.search('proj-1', 'query', { topK: 1 });
    expect(results).toHaveLength(1);
  });

  it('forwards accessScope to the catalog so the DB filters by visibility', async () => {
    catalog.listSearchable.mockResolvedValue([]);
    const accessScope = { userId: 'u-1', roles: ['viewer'] };

    await service.search('proj-1', 'revenue', { accessScope });

    expect(catalog.listSearchable).toHaveBeenCalledWith('proj-1', accessScope);
  });

  it('returns empty without querying when entityTypes excludes DATA_MART', async () => {
    const results = await service.search('proj-1', 'revenue', { entityTypes: [] });

    expect(results).toEqual([]);
    expect(catalog.listSearchable).not.toHaveBeenCalled();
  });

  it('tags every result with entityType DATA_MART', async () => {
    catalog.listSearchable.mockResolvedValue([makeMart('dm-1', 'Revenue')]);
    repository.listByProject.mockResolvedValue([{ dataMartId: 'dm-1', embedding: null }]);
    provider.embed.mockResolvedValue([null]);

    const results = await service.search('proj-1', 'revenue');

    expect(results[0].entityType).toBe(SearchableEntityType.DATA_MART);
    expect(results[0].entityId).toBe('dm-1');
  });
});
