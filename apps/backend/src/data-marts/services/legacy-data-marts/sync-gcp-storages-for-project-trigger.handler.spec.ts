import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHEDULER_FACADE,
  SchedulerFacade,
} from '../../../common/scheduler/shared/scheduler.facade';
import { SyncGcpStoragesForProjectTrigger } from '../../entities/legacy-data-marts/sync-gcp-storages-for-project-trigger.entity';
import { SyncLegacyGcpStoragesForProjectService } from '../../use-cases/legacy-data-marts/sync-legacy-gcp-storages-for-project.service';
import { SyncGcpStoragesForProjectTriggerHandler } from './sync-gcp-storages-for-project-trigger.handler';

// Mock external dependencies to avoid ESM import issues
jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: jest.fn().mockImplementation(() => ({
    getIdToken: jest.fn().mockResolvedValue('mock-token'),
  })),
}));
jest.mock('@databricks/sql', () => ({
  DBSQLClient: jest.fn(),
}));

describe('SyncGcpStoragesForProjectTriggerHandler', () => {
  let handler: SyncGcpStoragesForProjectTriggerHandler;
  let repository: jest.Mocked<Repository<SyncGcpStoragesForProjectTrigger>>;
  let schedulerFacade: jest.Mocked<SchedulerFacade>;
  let syncService: jest.Mocked<SyncLegacyGcpStoragesForProjectService>;

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncGcpStoragesForProjectTrigger>>;

    schedulerFacade = {
      registerTriggerHandler: jest.fn(),
    } as unknown as jest.Mocked<SchedulerFacade>;

    syncService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<SyncLegacyGcpStoragesForProjectService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncGcpStoragesForProjectTriggerHandler,
        { provide: getRepositoryToken(SyncGcpStoragesForProjectTrigger), useValue: repository },
        { provide: SCHEDULER_FACADE, useValue: schedulerFacade },
        { provide: SyncLegacyGcpStoragesForProjectService, useValue: syncService },
      ],
    }).compile();

    handler = module.get<SyncGcpStoragesForProjectTriggerHandler>(
      SyncGcpStoragesForProjectTriggerHandler
    );
  });

  describe('getTriggerRepository', () => {
    it('should return the repository', () => {
      expect(handler.getTriggerRepository()).toBe(repository);
    });
  });

  describe('handleTrigger', () => {
    it('should call sync service and update trigger with GCP projects count', async () => {
      const trigger = {
        projectId: 'test-project',
        gcpProjectsCount: 0,
      } as SyncGcpStoragesForProjectTrigger;

      syncService.run.mockResolvedValue(3);

      await handler.handleTrigger(trigger);

      expect(syncService.run).toHaveBeenCalledWith(trigger);
      expect(trigger.gcpProjectsCount).toBe(3);
    });
  });

  describe('onModuleInit', () => {
    it('should register itself with scheduler facade', async () => {
      await handler.onModuleInit();

      expect(schedulerFacade.registerTriggerHandler).toHaveBeenCalledWith(handler);
    });
  });
});
