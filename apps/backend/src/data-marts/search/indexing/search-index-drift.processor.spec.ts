import { Test, TestingModule } from '@nestjs/testing';
import { SearchIndexDriftProcessor } from './search-index-drift.processor';
import { AdvancedSearchIndexSyncService } from '../../services/advanced-search-index-sync.service';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';
import { IndexableSourceRegistry } from '../sources/indexable-source.registry';
import { SystemTriggerType } from '../../../common/scheduler/system-tasks/system-trigger-type';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { IndexableSource } from '../sources/indexable-source.port';
import type { SystemTrigger } from '../../../common/scheduler/shared/entities/system-trigger.entity';

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

function makeSource(
  entityType: SearchableEntityType,
  projectIds: string[]
): jest.Mocked<
  Pick<
    IndexableSource,
    'entityType' | 'listProjectIds' | 'listSearchablePage' | 'loadSearchableOne'
  >
> {
  return {
    entityType,
    listProjectIds: jest.fn().mockResolvedValue(projectIds),
    listSearchablePage: jest.fn(),
    loadSearchableOne: jest.fn(),
  };
}

describe('SearchIndexDriftProcessor', () => {
  let processor: SearchIndexDriftProcessor;
  let registry: jest.Mocked<Pick<IndexableSourceRegistry, 'all'>>;
  let indexSync: jest.Mocked<
    Pick<
      AdvancedSearchIndexSyncService,
      'scheduleReindex' | 'scheduleDelete' | 'scheduleTypeProjectSync'
    >
  >;

  beforeEach(async () => {
    registry = {
      all: jest.fn().mockReturnValue([]),
    };

    indexSync = {
      scheduleReindex: jest.fn().mockResolvedValue(undefined),
      scheduleDelete: jest.fn().mockResolvedValue(undefined),
      scheduleTypeProjectSync: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexDriftProcessor,
        { provide: IndexableSourceRegistry, useValue: registry },
        { provide: AdvancedSearchIndexSyncService, useValue: indexSync },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig() },
      ],
    }).compile();

    processor = module.get(SearchIndexDriftProcessor);
  });

  describe('getType', () => {
    it('returns SEARCH_INDEX_DRIFT', () => {
      expect(processor.getType()).toBe(SystemTriggerType.SEARCH_INDEX_DRIFT);
    });
  });

  describe('getDefaultCron', () => {
    it('returns the configured driftCron', () => {
      expect(processor.getDefaultCron()).toBe('*/10 * * * *');
    });

    it('reflects a custom driftCron from config', async () => {
      const module = await Test.createTestingModule({
        providers: [
          SearchIndexDriftProcessor,
          { provide: IndexableSourceRegistry, useValue: registry },
          { provide: AdvancedSearchIndexSyncService, useValue: indexSync },
          { provide: ADVANCED_SEARCH_CONFIG, useValue: makeConfig({ driftCron: '0 * * * *' }) },
        ],
      }).compile();

      const customProcessor = module.get(SearchIndexDriftProcessor);
      expect(customProcessor.getDefaultCron()).toBe('0 * * * *');
    });
  });

  describe('isEnabled', () => {
    it('returns true', () => {
      expect(processor.isEnabled()).toBe(true);
    });
  });

  describe('process', () => {
    const fakeTrigger = {} as SystemTrigger;

    it('does nothing when registry has no sources', async () => {
      registry.all.mockReturnValue([]);

      await processor.process(fakeTrigger);

      expect(indexSync.scheduleTypeProjectSync).not.toHaveBeenCalled();
    });

    it('schedules a project sync for each project in each source', async () => {
      const martSource = makeSource(SearchableEntityType.DATA_MART, ['proj-1', 'proj-2']);
      const storageSource = makeSource(SearchableEntityType.DATA_STORAGE, ['proj-1']);
      registry.all.mockReturnValue([martSource, storageSource] as unknown as IndexableSource[]);

      await processor.process(fakeTrigger);

      expect(indexSync.scheduleTypeProjectSync).toHaveBeenCalledTimes(3);
      expect(indexSync.scheduleTypeProjectSync).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-1'
      );
      expect(indexSync.scheduleTypeProjectSync).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-2'
      );
      expect(indexSync.scheduleTypeProjectSync).toHaveBeenCalledWith(
        SearchableEntityType.DATA_STORAGE,
        'proj-1'
      );
    });

    it('skips remaining sources when signal is aborted before next source', async () => {
      const controller = new AbortController();

      const martSource = makeSource(SearchableEntityType.DATA_MART, ['proj-1']);
      const storageSource = makeSource(SearchableEntityType.DATA_STORAGE, ['proj-2']);

      (martSource.listProjectIds as jest.Mock).mockImplementation(async () => {
        controller.abort();
        return ['proj-1'];
      });

      registry.all.mockReturnValue([martSource, storageSource] as unknown as IndexableSource[]);

      await processor.process(fakeTrigger, { signal: controller.signal });

      expect(storageSource.listProjectIds).not.toHaveBeenCalled();
    });

    it('skips remaining projects within a source when signal is aborted mid-project', async () => {
      const controller = new AbortController();
      let callCount = 0;

      indexSync.scheduleTypeProjectSync.mockImplementation(async () => {
        callCount++;
        controller.abort();
      });

      const source = makeSource(SearchableEntityType.DATA_MART, ['proj-1', 'proj-2', 'proj-3']);
      registry.all.mockReturnValue([source] as unknown as IndexableSource[]);

      await processor.process(fakeTrigger, { signal: controller.signal });

      expect(callCount).toBe(1);
    });

    it('does not call scheduleTypeProjectSync when source has no projects', async () => {
      const source = makeSource(SearchableEntityType.DATA_MART, []);
      registry.all.mockReturnValue([source] as unknown as IndexableSource[]);

      await processor.process(fakeTrigger);

      expect(indexSync.scheduleTypeProjectSync).not.toHaveBeenCalled();
    });

    it('processes without a signal option', async () => {
      const source = makeSource(SearchableEntityType.DATA_MART, ['proj-1']);
      registry.all.mockReturnValue([source] as unknown as IndexableSource[]);

      await expect(processor.process(fakeTrigger)).resolves.not.toThrow();

      expect(indexSync.scheduleTypeProjectSync).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-1'
      );
    });
  });
});
