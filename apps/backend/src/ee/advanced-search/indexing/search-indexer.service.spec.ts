import { Test, TestingModule } from '@nestjs/testing';
import { SearchIndexerService } from './search-indexer.service';
import {
  DATA_MART_CATALOG,
  DataMartCatalogPort,
  SearchableDataMart,
} from '../catalog/data-mart-catalog.port';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { docHash, buildDocument } from './document-builder';

function makeMart(overrides: Partial<SearchableDataMart> = {}): SearchableDataMart {
  return {
    id: 'dm-1',
    projectId: 'proj-1',
    title: 'Revenue',
    description: null,
    fieldNames: [],
    contexts: [],
    modifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    reconcileCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 2,
    ...overrides,
  };
}

describe('SearchIndexerService', () => {
  let service: SearchIndexerService;
  let catalog: jest.Mocked<DataMartCatalogPort>;
  let provider: jest.Mocked<EmbeddingProvider>;
  let repository: jest.Mocked<
    Pick<
      SearchIndexRepository,
      'upsert' | 'listHashes' | 'deleteAllExcept' | 'listByProject' | 'maxUpdatedAt'
    >
  >;

  const fakeVec = new Float32Array([0.1, 0.2, 0.3]);

  beforeEach(async () => {
    catalog = {
      listSearchable: jest.fn().mockResolvedValue([]),
      listRelationships: jest.fn().mockResolvedValue([]),
      listLiveIds: jest.fn().mockResolvedValue(new Set<string>()),
    };

    provider = {
      modelId: 'test-model',
      embed: jest.fn().mockResolvedValue([fakeVec]),
    } as unknown as jest.Mocked<EmbeddingProvider>;

    repository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      listHashes: jest.fn().mockResolvedValue(new Map()),
      deleteAllExcept: jest.fn().mockResolvedValue(0),
      listByProject: jest.fn().mockResolvedValue([]),
      maxUpdatedAt: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexerService,
        { provide: DATA_MART_CATALOG, useValue: catalog },
        { provide: EMBEDDING_PROVIDER, useValue: provider },
        { provide: SearchIndexRepository, useValue: repository },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig() },
      ],
    }).compile();

    service = module.get(SearchIndexerService);
  });

  describe('reconcile', () => {
    it('indexes a new mart', async () => {
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map());
      provider.embed.mockResolvedValue([fakeVec]);

      await service.reconcile();

      expect(provider.embed).toHaveBeenCalledTimes(1);
      expect(repository.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = (repository.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertArg.dataMartId).toBe('dm-1');
      expect(upsertArg.embedding).not.toBeNull();
    });

    it('skips a mart whose hash has not changed', async () => {
      const mart = makeMart();
      const doc = buildDocument(mart);
      const hash = docHash('test-model', doc);
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map([['dm-1', hash]]));

      await service.reconcile();

      expect(provider.embed).not.toHaveBeenCalled();
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('re-indexes a mart whose document changed', async () => {
      const mart = makeMart({ title: 'Updated Title' });
      const staleHash = docHash('test-model', buildDocument(makeMart({ title: 'Old Title' })));
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map([['dm-1', staleHash]]));
      provider.embed.mockResolvedValue([fakeVec]);

      await service.reconcile();

      expect(provider.embed).toHaveBeenCalledTimes(1);
      expect(repository.upsert).toHaveBeenCalledTimes(1);
    });

    it('deletes orphan rows after reconcile', async () => {
      catalog.listSearchable.mockResolvedValue([]);
      catalog.listLiveIds.mockResolvedValue(new Set(['alive-dm']));
      repository.listHashes.mockResolvedValue(new Map());

      await service.reconcile();

      expect(repository.deleteAllExcept).toHaveBeenCalledWith(new Set(['alive-dm']));
    });

    it('persists null embedding when embed returns null', async () => {
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map());
      provider.embed.mockResolvedValue([null]);

      await service.reconcile();

      expect(repository.upsert).toHaveBeenCalledTimes(1);
      const upsertArg = (repository.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertArg.embedding).toBeNull();
      expect(upsertArg.dim).toBeNull();
    });

    it('emits a warn log when embed returns null for at least one mart', async () => {
      const warnSpy = jest.spyOn(
        (service as unknown as { logger: { warn: jest.Mock } }).logger,
        'warn'
      );
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map());
      provider.embed.mockResolvedValue([null]);

      await service.reconcile();

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/embed failure/);
    });

    it('catches and logs batch errors without throwing', async () => {
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map());
      provider.embed.mockRejectedValue(new Error('embed failed'));

      await expect(service.reconcile()).resolves.not.toThrow();
    });

    it('swallows catalog errors and releases the in-flight guard', async () => {
      catalog.listSearchable.mockRejectedValueOnce(new Error('zod hydration failed'));

      await expect(service.reconcile()).resolves.not.toThrow();

      catalog.listSearchable.mockResolvedValue([]);
      catalog.listLiveIds.mockResolvedValue(new Set());
      repository.listHashes.mockResolvedValue(new Map());

      await service.reconcile();
      expect(catalog.listLiveIds).toHaveBeenCalled();
    });

    it('overlap guard: second concurrent reconcile with same key is skipped', async () => {
      let resolveFirst!: () => void;
      const firstPromise = new Promise<void>(res => (resolveFirst = res));
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map());
      provider.embed.mockReturnValue(firstPromise.then(() => [fakeVec]));

      const first = service.reconcile();
      const second = service.reconcile();

      resolveFirst();
      await Promise.all([first, second]);

      expect(provider.embed).toHaveBeenCalledTimes(1);
    });

    it('overlap guard: scoped reconcile is skipped when global is in flight', async () => {
      let resolveGlobal!: () => void;
      const globalPromise = new Promise<void>(res => (resolveGlobal = res));
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      catalog.listLiveIds.mockResolvedValue(new Set([mart.id]));
      repository.listHashes.mockResolvedValue(new Map());
      provider.embed.mockReturnValue(globalPromise.then(() => [fakeVec]));

      const global = service.reconcile();
      const scoped = service.reconcile('proj-1');

      resolveGlobal();
      await Promise.all([global, scoped]);

      expect(provider.embed).toHaveBeenCalledTimes(1);
    });

    it('overlap guard: two different project reconciles both run', async () => {
      let resolveA!: () => void;
      const promiseA = new Promise<void>(res => (resolveA = res));
      const martA = makeMart({ id: 'dm-a', projectId: 'proj-a' });
      const martB = makeMart({ id: 'dm-b', projectId: 'proj-b' });
      catalog.listSearchable.mockImplementation((projectId?: string) =>
        Promise.resolve(projectId === 'proj-a' ? [martA] : [martB])
      );
      catalog.listLiveIds.mockImplementation((projectId?: string) =>
        Promise.resolve(new Set([projectId === 'proj-a' ? 'dm-a' : 'dm-b']))
      );
      repository.listHashes.mockResolvedValue(new Map());
      provider.embed
        .mockReturnValueOnce(promiseA.then(() => [fakeVec]))
        .mockResolvedValue([fakeVec]);

      const a = service.reconcile('proj-a');
      const b = service.reconcile('proj-b');

      resolveA();
      await Promise.all([a, b]);

      expect(provider.embed).toHaveBeenCalledTimes(2);
    });
  });

  describe('reindexDataMart', () => {
    it('embeds and upserts when mart is found', async () => {
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      provider.embed.mockResolvedValue([fakeVec]);

      await service.reindexDataMart('dm-1');

      expect(repository.upsert).toHaveBeenCalledTimes(1);
    });

    it('passes projectId to catalog when provided', async () => {
      const mart = makeMart();
      catalog.listSearchable.mockResolvedValue([mart]);
      provider.embed.mockResolvedValue([fakeVec]);

      await service.reindexDataMart('dm-1', 'proj-1');

      expect(catalog.listSearchable).toHaveBeenCalledWith('proj-1');
    });

    it('skips silently when mart is not found in catalog', async () => {
      catalog.listSearchable.mockResolvedValue([]);

      await service.reindexDataMart('no-such-mart');

      expect(repository.upsert).not.toHaveBeenCalled();
    });
  });
});
