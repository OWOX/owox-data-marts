import { Test, TestingModule } from '@nestjs/testing';
import { SearchIndexerService } from './search-indexer.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from '../embedding/embedding-provider';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { EntityScoringDescriptor } from './entity-scoring-descriptor';
import { docHash, indexSignature } from './document-builder';
import type { IndexableSource, PageCursor, SearchablePage } from '../sources/indexable-source.port';

function makeDescriptor(overrides: Partial<EntityScoringDescriptor> = {}): EntityScoringDescriptor {
  const base = {
    entityType: SearchableEntityType.DATA_MART,
    entityId: 'dm-1',
    projectId: 'proj-1',
    title: 'Revenue',
    description: null,
    richTextSlots: [{ kind: 'title', text: 'Revenue' }] as EntityScoringDescriptor['richTextSlots'],
    atomicTokenSlots: [] as EntityScoringDescriptor['atomicTokenSlots'],
    fieldCount: 0,
    extendability: 0,
    modifiedAt: new Date('2024-01-01'),
    isDraft: false,
    ...overrides,
  };
  if (!('embeddingText' in base)) {
    (base as EntityScoringDescriptor).embeddingText = base.title;
  }
  return base as EntityScoringDescriptor;
}

function makePage(descriptors: EntityScoringDescriptor[], hasMore = false): SearchablePage {
  const last = descriptors[descriptors.length - 1];
  const nextCursor: PageCursor | null =
    hasMore && last ? { createdAt: last.modifiedAt.toISOString(), id: last.entityId } : null;
  return { descriptors, nextCursor };
}

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    driftCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 2,
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

describe('SearchIndexerService', () => {
  let service: SearchIndexerService;
  let source: jest.Mocked<
    Pick<
      IndexableSource,
      'listProjectIds' | 'listSearchablePage' | 'loadSearchableOne' | 'entityType'
    >
  >;
  let registry: jest.Mocked<Pick<IndexableSourceRegistry, 'all' | 'resolve'>>;
  let provider: jest.Mocked<EmbeddingProvider>;
  let repository: jest.Mocked<
    Pick<
      SearchIndexRepository,
      | 'upsert'
      | 'upsertMany'
      | 'listIndexStateByIds'
      | 'deleteByEntityId'
      | 'deleteByEntityIds'
      | 'deleteOrphans'
    >
  >;

  const fakeVec = new Float32Array([0.1, 0.2, 0.3]);

  beforeEach(async () => {
    source = {
      entityType: SearchableEntityType.DATA_MART,
      listProjectIds: jest.fn().mockResolvedValue(['proj-1']),
      listSearchablePage: jest.fn().mockResolvedValue(makePage([])),
      loadSearchableOne: jest.fn().mockResolvedValue(null),
    };

    registry = {
      all: jest.fn().mockReturnValue([source]),
      resolve: jest
        .fn()
        .mockImplementation((type: SearchableEntityType) =>
          type === SearchableEntityType.DATA_MART ? source : undefined
        ),
    };

    provider = {
      modelId: 'test-model',
      dimensions: 384,
      embed: jest.fn().mockResolvedValue([fakeVec]),
    } as unknown as jest.Mocked<EmbeddingProvider>;

    repository = {
      upsert: jest.fn().mockResolvedValue(undefined),
      upsertMany: jest.fn().mockResolvedValue(undefined),
      listIndexStateByIds: jest.fn().mockResolvedValue(new Map()),
      deleteByEntityId: jest.fn().mockResolvedValue(1),
      deleteByEntityIds: jest.fn().mockResolvedValue(1),
      deleteOrphans: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexerService,
        { provide: IndexableSourceRegistry, useValue: registry },
        { provide: EMBEDDING_PROVIDER, useValue: provider },
        { provide: SearchIndexRepository, useValue: repository },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig() },
      ],
    }).compile();

    service = module.get(SearchIndexerService);
  });

  describe('reindexEntity', () => {
    it('embeds and upserts when descriptor is found', async () => {
      const descriptor = makeDescriptor();
      source.loadSearchableOne.mockResolvedValue(descriptor);
      provider.embed.mockResolvedValue([fakeVec]);

      await service.reindexEntity(SearchableEntityType.DATA_MART, 'dm-1');

      expect(provider.embed).toHaveBeenCalledWith(['Revenue'], { inputType: 'search_document' });
      expect(source.loadSearchableOne).toHaveBeenCalledWith('dm-1');
      expect(repository.upsert).toHaveBeenCalledTimes(1);
      const [entityType, upsertArg] = (repository.upsert as jest.Mock).mock.calls[0];
      expect(entityType).toBe(SearchableEntityType.DATA_MART);
      expect(upsertArg.entityId).toBe('dm-1');
      expect(typeof upsertArg.document).toBe('string');
      expect(upsertArg.isDraft).toBe(false);
    });

    it('deletes from index when descriptor is not found in source', async () => {
      source.loadSearchableOne.mockResolvedValue(null);

      await service.reindexEntity(SearchableEntityType.DATA_MART, 'dm-1');

      expect(repository.upsert).not.toHaveBeenCalled();
      expect(repository.deleteByEntityId).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'dm-1'
      );
    });

    it('deletes the existing index row instead of upserting when embedding is unavailable', async () => {
      const descriptor = makeDescriptor();
      source.loadSearchableOne.mockResolvedValue(descriptor);
      provider.embed.mockResolvedValue([null]);

      await service.reindexEntity(SearchableEntityType.DATA_MART, 'dm-1');

      expect(repository.upsert).not.toHaveBeenCalled();
      expect(repository.deleteByEntityId).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'dm-1'
      );
    });

    it('skips when the provided projectId does not match the descriptor', async () => {
      const descriptor = makeDescriptor({ projectId: 'proj-1' });
      source.loadSearchableOne.mockResolvedValue(descriptor);

      await service.reindexEntity(SearchableEntityType.DATA_MART, 'dm-1', 'other-proj');

      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('skips silently when the source is not registered', async () => {
      registry.resolve.mockReturnValue(undefined);

      await service.reindexEntity(SearchableEntityType.DATA_MART, 'dm-1');

      expect(repository.upsert).not.toHaveBeenCalled();
    });
  });

  describe('deleteEntity', () => {
    it('delegates to repository.deleteByEntityId', async () => {
      await service.deleteEntity(SearchableEntityType.DATA_MART, 'dm-1');

      expect(repository.deleteByEntityId).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'dm-1'
      );
    });
  });

  describe('syncTypeProject', () => {
    it('indexes a new descriptor in the project', async () => {
      const descriptor = makeDescriptor();
      source.listSearchablePage.mockResolvedValueOnce(makePage([descriptor]));

      const stats = await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(provider.embed).toHaveBeenCalledTimes(1);
      expect(provider.embed).toHaveBeenCalledWith(['Revenue'], { inputType: 'search_document' });
      expect(repository.upsertMany).toHaveBeenCalledTimes(1);
      const [entityType, rows] = (repository.upsertMany as jest.Mock).mock.calls[0];
      expect(entityType).toBe(SearchableEntityType.DATA_MART);
      expect(rows).toHaveLength(1);
      expect(rows[0].entityId).toBe('dm-1');
      expect(rows[0].embedding).not.toBeNull();
      expect(typeof rows[0].document).toBe('string');
      expect(rows[0].isDraft).toBe(false);
      expect(stats.indexed).toBe(1);
      expect(stats.skipped).toBe(0);
    });

    it('skips a descriptor whose hash and embedding status have not changed', async () => {
      const descriptor = makeDescriptor();
      const hash = docHash('test-model', indexSignature(descriptor));
      source.listSearchablePage.mockResolvedValueOnce(makePage([descriptor]));
      repository.listIndexStateByIds.mockResolvedValue(
        new Map([['dm-1', { docHash: hash, embeddingStatus: 'READY' }]])
      );

      const stats = await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(provider.embed).not.toHaveBeenCalled();
      expect(repository.upsertMany).not.toHaveBeenCalled();
      expect(stats.skipped).toBe(1);
      expect(stats.indexed).toBe(0);
    });

    it('re-indexes a descriptor whose embedding was previously missing', async () => {
      const descriptor = makeDescriptor();
      const hash = docHash('test-model', indexSignature(descriptor));
      source.listSearchablePage.mockResolvedValueOnce(makePage([descriptor]));
      repository.listIndexStateByIds.mockResolvedValue(
        new Map([['dm-1', { docHash: hash, embeddingStatus: 'MISSING' }]])
      );

      const stats = await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(provider.embed).toHaveBeenCalledTimes(1);
      expect(repository.upsertMany).toHaveBeenCalledTimes(1);
      expect(stats.indexed).toBe(1);
    });

    it('re-indexes a descriptor whose document changed', async () => {
      const descriptor = makeDescriptor({
        title: 'Updated Title',
        richTextSlots: [{ kind: 'title', text: 'Updated Title' }],
        embeddingText: 'Updated Title',
      });
      const staleHash = docHash(
        'test-model',
        indexSignature(
          makeDescriptor({
            title: 'Old Title',
            richTextSlots: [{ kind: 'title', text: 'Old Title' }],
            embeddingText: 'Old Title',
          })
        )
      );
      source.listSearchablePage.mockResolvedValueOnce(makePage([descriptor]));
      repository.listIndexStateByIds.mockResolvedValue(
        new Map([['dm-1', { docHash: staleHash, embeddingStatus: 'READY' }]])
      );

      await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(provider.embed).toHaveBeenCalledTimes(1);
      expect(repository.upsertMany).toHaveBeenCalledTimes(1);
    });

    it('calls project-scoped deleteOrphans after processing all pages', async () => {
      source.listSearchablePage.mockResolvedValue(makePage([]));

      await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(repository.deleteOrphans).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-1'
      );
    });

    it('does not call deleteOrphans when signal is aborted before completion', async () => {
      const controller = new AbortController();
      source.listSearchablePage.mockImplementation(async () => {
        controller.abort();
        return makePage([]);
      });

      await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1', controller.signal);

      expect(repository.deleteOrphans).not.toHaveBeenCalled();
    });

    it('records deletedOrphans in returned stats', async () => {
      source.listSearchablePage.mockResolvedValue(makePage([]));
      repository.deleteOrphans.mockResolvedValue(3);

      const stats = await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(stats.deletedOrphans).toBe(3);
    });

    it('does not embed when page is empty', async () => {
      source.listSearchablePage.mockResolvedValueOnce(makePage([]));

      await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(provider.embed).not.toHaveBeenCalled();
    });

    it('deletes entityIds whose embed returns null', async () => {
      const descriptor = makeDescriptor();
      source.listSearchablePage.mockResolvedValueOnce(makePage([descriptor]));
      provider.embed.mockResolvedValue([null]);

      const stats = await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(repository.upsertMany).not.toHaveBeenCalled();
      expect(repository.deleteByEntityIds).toHaveBeenCalledWith(SearchableEntityType.DATA_MART, [
        'dm-1',
      ]);
      expect(stats.embedFailed).toBe(1);
    });

    it('records errors and continues when embed throws', async () => {
      const descriptor = makeDescriptor();
      source.listSearchablePage.mockResolvedValueOnce(makePage([descriptor]));
      provider.embed.mockRejectedValue(new Error('embed failed'));

      const stats = await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(stats.errors).toBe(1);
    });

    it('returns early with empty stats when source is not registered', async () => {
      registry.resolve.mockReturnValue(undefined);

      const stats = await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(stats.indexed).toBe(0);
      expect(stats.skipped).toBe(0);
      expect(stats.embedFailed).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.deletedOrphans).toBe(0);
      expect(repository.deleteOrphans).not.toHaveBeenCalled();
    });

    it('paginates through multiple pages', async () => {
      const d1 = makeDescriptor({ entityId: 'dm-1' });
      const d2 = makeDescriptor({ entityId: 'dm-2' });
      const d3 = makeDescriptor({ entityId: 'dm-3' });
      source.listSearchablePage
        .mockResolvedValueOnce(makePage([d1, d2], true))
        .mockResolvedValueOnce(makePage([d3]));

      await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      expect(source.listSearchablePage).toHaveBeenCalledTimes(2);
      expect(provider.embed).toHaveBeenCalledTimes(2);
    });

    it('writes isDraft flag from descriptor into the upserted row', async () => {
      const descriptor = makeDescriptor({ isDraft: true });
      source.listSearchablePage.mockResolvedValueOnce(makePage([descriptor]));

      await service.syncTypeProject(SearchableEntityType.DATA_MART, 'proj-1');

      const rows = (repository.upsertMany as jest.Mock).mock.calls[0][1];
      expect(rows[0].isDraft).toBe(true);
    });
  });
});
