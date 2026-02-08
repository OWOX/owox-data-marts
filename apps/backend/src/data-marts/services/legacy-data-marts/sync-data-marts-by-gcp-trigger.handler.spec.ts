import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SCHEDULER_FACADE,
  SchedulerFacade,
} from '../../../common/scheduler/shared/scheduler.facade';
import { SyncDataMartsByGcpTrigger } from '../../entities/legacy-data-marts/sync-data-marts-by-gcp-trigger.entity';
import { SyncLegacyDataMartsByGcpService } from '../../use-cases/legacy-data-marts/sync-legacy-data-marts-by-gcp.service';
import { SyncDataMartsByGcpTriggerHandler } from './sync-data-marts-by-gcp-trigger.handler';

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

describe('SyncDataMartsByGcpTriggerHandler', () => {
  let handler: SyncDataMartsByGcpTriggerHandler;
  let repository: jest.Mocked<Repository<SyncDataMartsByGcpTrigger>>;
  let schedulerFacade: jest.Mocked<SchedulerFacade>;
  let syncService: jest.Mocked<SyncLegacyDataMartsByGcpService>;

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncDataMartsByGcpTrigger>>;

    schedulerFacade = {
      registerTriggerHandler: jest.fn(),
    } as unknown as jest.Mocked<SchedulerFacade>;

    syncService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<SyncLegacyDataMartsByGcpService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncDataMartsByGcpTriggerHandler,
        { provide: getRepositoryToken(SyncDataMartsByGcpTrigger), useValue: repository },
        { provide: SCHEDULER_FACADE, useValue: schedulerFacade },
        { provide: SyncLegacyDataMartsByGcpService, useValue: syncService },
      ],
    }).compile();

    handler = module.get<SyncDataMartsByGcpTriggerHandler>(SyncDataMartsByGcpTriggerHandler);
  });

  describe('getTriggerRepository', () => {
    it('should return the repository', () => {
      expect(handler.getTriggerRepository()).toBe(repository);
    });
  });

  describe('handleTrigger', () => {
    it('should call sync service and update trigger with data marts count', async () => {
      const trigger = {
        gcpProjectId: 'gcp-project',
        dataMartsCount: 0,
      } as SyncDataMartsByGcpTrigger;

      syncService.run.mockResolvedValue(5);

      await handler.handleTrigger(trigger);

      expect(syncService.run).toHaveBeenCalledWith({ gcpProjectId: 'gcp-project' });
      expect(trigger.dataMartsCount).toBe(5);
    });
  });

  describe('onModuleInit', () => {
    it('should register itself with scheduler facade', async () => {
      await handler.onModuleInit();

      expect(schedulerFacade.registerTriggerHandler).toHaveBeenCalledWith(handler);
    });
  });
});
