import { Test, TestingModule } from '@nestjs/testing';
import {
  SearchDataDestinationProjectReindexTriggerHandler,
  SearchDataMartProjectReindexTriggerHandler,
  SearchDataStorageProjectReindexTriggerHandler,
  SearchEntityReindexTriggerHandler,
} from './search-reindex-trigger-handler.service';
import { SearchIndexerService } from './search-indexer.service';
import {
  SCHEDULER_FACADE,
  SchedulerFacade,
} from '../../../common/scheduler/shared/scheduler.facade';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import type { SearchReindexTrigger } from '../../entities/search/search-reindex-trigger.entity';
import type {
  SearchDataDestinationProjectReindexTrigger,
  SearchDataMartProjectReindexTrigger,
  SearchDataStorageProjectReindexTrigger,
  SearchProjectReindexTrigger,
} from '../../entities/search/search-project-reindex-trigger.entity';
import { ADVANCED_SEARCH_CONFIG, AdvancedSearchConfig } from '../config/advanced-search.config';

type ProjectTrigger =
  | SearchDataMartProjectReindexTrigger
  | SearchDataStorageProjectReindexTrigger
  | SearchDataDestinationProjectReindexTrigger;

function makeEntityTrigger(overrides: Partial<SearchReindexTrigger> = {}): SearchReindexTrigger {
  return {
    id: 'entity-trigger-1',
    isActive: true,
    version: 1,
    status: TriggerStatus.PROCESSING,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    modifiedAt: new Date('2024-01-01T00:00:00.000Z'),
    projectId: 'proj-1',
    entityType: SearchableEntityType.DATA_MART,
    entityId: 'dm-1',
    operation: 'REINDEX',
    onSuccess: jest.fn(),
    onError: jest.fn(),
    ...overrides,
  } as unknown as SearchReindexTrigger;
}

function makeProjectTrigger(overrides: Partial<SearchProjectReindexTrigger> = {}): ProjectTrigger {
  return {
    id: 'project-trigger-1',
    isActive: true,
    version: 1,
    status: TriggerStatus.PROCESSING,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    modifiedAt: new Date('2024-01-01T00:00:00.000Z'),
    projectId: 'proj-1',
    onSuccess: jest.fn(),
    onError: jest.fn(),
    ...overrides,
  } as unknown as ProjectTrigger;
}

function makeConfig(overrides: Partial<AdvancedSearchConfig> = {}): AdvancedSearchConfig {
  return {
    modelCacheDir: null,
    driftCron: '*/10 * * * *',
    topK: 3,
    indexBatchSize: 20,
    vectorCandidateMultiplier: 2,
    minRelevance: 40,
    candidateLimit: 500,
    queryMaxLength: 256,
    embeddingConcurrency: 2,
    embeddingProvider: 'local',
    entityProcessingCron: '*/2 * * * * *',
    dataMartProjectProcessingCron: '0,30 * * * * *',
    dataStorageProjectProcessingCron: '10,40 * * * * *',
    dataDestinationProjectProcessingCron: '20,50 * * * * *',
    openRouterEmbeddingModel: 'google/gemini-embedding-2',
    openRouterEmbeddingDimensions: 768,
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

describe('Search reindex trigger handlers', () => {
  let entityHandler: SearchEntityReindexTriggerHandler;
  let dataMartProjectHandler: SearchDataMartProjectReindexTriggerHandler;
  let dataStorageProjectHandler: SearchDataStorageProjectReindexTriggerHandler;
  let dataDestinationProjectHandler: SearchDataDestinationProjectReindexTriggerHandler;
  let indexer: jest.Mocked<
    Pick<SearchIndexerService, 'reindexEntity' | 'deleteEntity' | 'syncTypeProject'>
  >;
  let schedulerFacade: jest.Mocked<SchedulerFacade>;
  let entityTriggerRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let dataMartProjectTriggerRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };
  let dataStorageProjectTriggerRepo: typeof dataMartProjectTriggerRepo;
  let dataDestinationProjectTriggerRepo: typeof dataMartProjectTriggerRepo;
  let config: AdvancedSearchConfig;

  beforeEach(() => {
    indexer = {
      reindexEntity: jest.fn().mockResolvedValue(undefined),
      deleteEntity: jest.fn().mockResolvedValue(undefined),
      syncTypeProject: jest.fn().mockResolvedValue({
        indexed: 0,
        skipped: 0,
        embedFailed: 0,
        errors: 0,
        deletedOrphans: 0,
      }),
    };

    schedulerFacade = {
      registerTriggerHandler: jest.fn().mockResolvedValue(undefined),
    };
    config = makeConfig();

    entityTriggerRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    dataMartProjectTriggerRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    dataStorageProjectTriggerRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    dataDestinationProjectTriggerRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };
  });

  async function compileEntityHandler(): Promise<void> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchEntityReindexTriggerHandler,
        { provide: SearchIndexerService, useValue: indexer },
        { provide: SCHEDULER_FACADE, useValue: schedulerFacade },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: config },
        {
          provide: 'SearchReindexTriggerRepository',
          useValue: entityTriggerRepo,
        },
      ],
    })
      .overrideProvider('SearchReindexTriggerRepository')
      .useValue(entityTriggerRepo)
      .compile();

    entityHandler = module.get(SearchEntityReindexTriggerHandler);
  }

  async function compileProjectHandlers(): Promise<void> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchDataMartProjectReindexTriggerHandler,
        SearchDataStorageProjectReindexTriggerHandler,
        SearchDataDestinationProjectReindexTriggerHandler,
        { provide: SearchIndexerService, useValue: indexer },
        { provide: SCHEDULER_FACADE, useValue: schedulerFacade },
        { provide: ADVANCED_SEARCH_CONFIG, useValue: config },
        {
          provide: 'SearchDataMartProjectReindexTriggerRepository',
          useValue: dataMartProjectTriggerRepo,
        },
        {
          provide: 'SearchDataStorageProjectReindexTriggerRepository',
          useValue: dataStorageProjectTriggerRepo,
        },
        {
          provide: 'SearchDataDestinationProjectReindexTriggerRepository',
          useValue: dataDestinationProjectTriggerRepo,
        },
      ],
    })
      .overrideProvider('SearchDataMartProjectReindexTriggerRepository')
      .useValue(dataMartProjectTriggerRepo)
      .overrideProvider('SearchDataStorageProjectReindexTriggerRepository')
      .useValue(dataStorageProjectTriggerRepo)
      .overrideProvider('SearchDataDestinationProjectReindexTriggerRepository')
      .useValue(dataDestinationProjectTriggerRepo)
      .compile();

    dataMartProjectHandler = module.get(SearchDataMartProjectReindexTriggerHandler);
    dataStorageProjectHandler = module.get(SearchDataStorageProjectReindexTriggerHandler);
    dataDestinationProjectHandler = module.get(SearchDataDestinationProjectReindexTriggerHandler);
  }

  describe('onModuleInit', () => {
    it('registers entity handler with the scheduler facade', async () => {
      await compileEntityHandler();

      await entityHandler.onModuleInit();

      expect(schedulerFacade.registerTriggerHandler).toHaveBeenCalledWith(entityHandler);
    });

    it('registers every project handler with the scheduler facade', async () => {
      await compileProjectHandlers();

      await dataMartProjectHandler.onModuleInit();
      await dataStorageProjectHandler.onModuleInit();
      await dataDestinationProjectHandler.onModuleInit();

      expect(schedulerFacade.registerTriggerHandler).toHaveBeenCalledWith(dataMartProjectHandler);
      expect(schedulerFacade.registerTriggerHandler).toHaveBeenCalledWith(
        dataStorageProjectHandler
      );
      expect(schedulerFacade.registerTriggerHandler).toHaveBeenCalledWith(
        dataDestinationProjectHandler
      );
    });
  });

  describe('entity handler contract methods', () => {
    beforeEach(async () => {
      await compileEntityHandler();
    });

    it('uses fast polling and low-concurrency batch settings', () => {
      expect(entityHandler.processingCronExpression()).toBe('*/2 * * * * *');
      expect(entityHandler.processingBatchLimit()).toBe(2);
      expect(entityHandler.stuckTriggerTimeoutSeconds()).toBe(5 * 60);
      expect(entityHandler.triggerTtlSeconds()).toBe(2 * 60 * 60);
    });

    it('uses configured entity trigger cron expression', async () => {
      config = makeConfig({ entityProcessingCron: '*/5 * * * * *' });
      await compileEntityHandler();

      expect(entityHandler.processingCronExpression()).toBe('*/5 * * * * *');
    });

    it('waits for a batch to finish before starting another one', () => {
      expect(entityHandler.waitForBatchCompletion()).toBe(true);
    });

    it('getTriggerRepository returns the entity trigger repository', () => {
      expect(entityHandler.getTriggerRepository()).toBe(entityTriggerRepo);
    });
  });

  describe('project handler contract methods', () => {
    beforeEach(async () => {
      await compileProjectHandlers();
    });

    it('uses offset polling and single-project batch settings', () => {
      expect(dataMartProjectHandler.processingCronExpression()).toBe('0,30 * * * * *');
      expect(dataStorageProjectHandler.processingCronExpression()).toBe('10,40 * * * * *');
      expect(dataDestinationProjectHandler.processingCronExpression()).toBe('20,50 * * * * *');

      for (const handler of [
        dataMartProjectHandler,
        dataStorageProjectHandler,
        dataDestinationProjectHandler,
      ]) {
        expect(handler.processingBatchLimit()).toBe(1);
        expect(handler.stuckTriggerTimeoutSeconds()).toBe(60 * 60);
        expect(handler.triggerTtlSeconds()).toBe(24 * 60 * 60);
        expect(handler.waitForBatchCompletion()).toBe(true);
      }
    });

    it('uses configured project trigger cron expressions', async () => {
      config = makeConfig({
        dataMartProjectProcessingCron: '1 * * * * *',
        dataStorageProjectProcessingCron: '2 * * * * *',
        dataDestinationProjectProcessingCron: '3 * * * * *',
      });
      await compileProjectHandlers();

      expect(dataMartProjectHandler.processingCronExpression()).toBe('1 * * * * *');
      expect(dataStorageProjectHandler.processingCronExpression()).toBe('2 * * * * *');
      expect(dataDestinationProjectHandler.processingCronExpression()).toBe('3 * * * * *');
    });

    it('each project handler owns a separate trigger repository', () => {
      expect(dataMartProjectHandler.getTriggerRepository()).toBe(dataMartProjectTriggerRepo);
      expect(dataStorageProjectHandler.getTriggerRepository()).toBe(dataStorageProjectTriggerRepo);
      expect(dataDestinationProjectHandler.getTriggerRepository()).toBe(
        dataDestinationProjectTriggerRepo
      );
    });
  });

  describe('entity handler handleTrigger', () => {
    beforeEach(async () => {
      await compileEntityHandler();
    });

    it('calls reindexEntity for entity REINDEX operation', async () => {
      const trigger = makeEntityTrigger({ operation: 'REINDEX', entityId: 'dm-1' });

      await entityHandler.handleTrigger(trigger);

      expect(indexer.reindexEntity).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'dm-1',
        'proj-1'
      );
      expect(indexer.deleteEntity).not.toHaveBeenCalled();
      expect(indexer.syncTypeProject).not.toHaveBeenCalled();
      expect(trigger.onSuccess).not.toHaveBeenCalled();
      expect(trigger.onError).not.toHaveBeenCalled();
      expect(entityTriggerRepo.save).not.toHaveBeenCalled();
    });

    it('calls deleteEntity for entity DELETE operation', async () => {
      const trigger = makeEntityTrigger({ operation: 'DELETE', entityId: 'dm-1' });

      await entityHandler.handleTrigger(trigger);

      expect(indexer.deleteEntity).toHaveBeenCalledWith(SearchableEntityType.DATA_MART, 'dm-1');
      expect(indexer.reindexEntity).not.toHaveBeenCalled();
      expect(indexer.syncTypeProject).not.toHaveBeenCalled();
    });
  });

  describe('project handler handleTrigger', () => {
    beforeEach(async () => {
      await compileProjectHandlers();
    });

    it('calls syncTypeProject for each handler fixed entity type', async () => {
      await dataMartProjectHandler.handleTrigger(makeProjectTrigger({ projectId: 'proj-1' }));
      await dataStorageProjectHandler.handleTrigger(makeProjectTrigger({ projectId: 'proj-2' }));
      await dataDestinationProjectHandler.handleTrigger(
        makeProjectTrigger({ projectId: 'proj-3' })
      );

      expect(indexer.syncTypeProject).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-1',
        undefined
      );
      expect(indexer.syncTypeProject).toHaveBeenCalledWith(
        SearchableEntityType.DATA_STORAGE,
        'proj-2',
        undefined
      );
      expect(indexer.syncTypeProject).toHaveBeenCalledWith(
        SearchableEntityType.DATA_DESTINATION,
        'proj-3',
        undefined
      );
    });

    it('passes AbortSignal through to syncTypeProject', async () => {
      const controller = new AbortController();
      const trigger = makeProjectTrigger();

      await dataMartProjectHandler.handleTrigger(trigger, { signal: controller.signal });

      expect(indexer.syncTypeProject).toHaveBeenCalledWith(
        SearchableEntityType.DATA_MART,
        'proj-1',
        controller.signal
      );
    });

    it('throws when syncTypeProject reports batch errors', async () => {
      indexer.syncTypeProject.mockResolvedValue({
        indexed: 1,
        skipped: 0,
        embedFailed: 0,
        errors: 2,
        deletedOrphans: 0,
      });

      await expect(dataMartProjectHandler.handleTrigger(makeProjectTrigger())).rejects.toThrow(
        'search project reindex failed'
      );
    });

    it('throws when syncTypeProject reports embedding failures', async () => {
      indexer.syncTypeProject.mockResolvedValue({
        indexed: 0,
        skipped: 0,
        embedFailed: 2,
        errors: 0,
        deletedOrphans: 0,
      });

      await expect(dataMartProjectHandler.handleTrigger(makeProjectTrigger())).rejects.toThrow(
        'search project reindex failed'
      );
    });
  });
});
