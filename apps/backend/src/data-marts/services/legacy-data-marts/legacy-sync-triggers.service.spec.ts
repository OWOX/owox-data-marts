import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { SyncDataMartsByGcpTrigger } from '../../entities/legacy-data-marts/sync-data-marts-by-gcp-trigger.entity';
import { SyncGcpStoragesForProjectTrigger } from '../../entities/legacy-data-marts/sync-gcp-storages-for-project-trigger.entity';
import { LegacySyncTriggersService } from './legacy-sync-triggers.service';

describe('LegacySyncTriggersService', () => {
  let service: LegacySyncTriggersService;
  let syncDataMartsTriggerRepo: jest.Mocked<Repository<SyncDataMartsByGcpTrigger>>;
  let syncStoragesTriggerRepo: jest.Mocked<Repository<SyncGcpStoragesForProjectTrigger>>;

  beforeEach(async () => {
    syncDataMartsTriggerRepo = {
      upsert: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncDataMartsByGcpTrigger>>;

    syncStoragesTriggerRepo = {
      upsert: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncGcpStoragesForProjectTrigger>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegacySyncTriggersService,
        {
          provide: getRepositoryToken(SyncDataMartsByGcpTrigger),
          useValue: syncDataMartsTriggerRepo,
        },
        {
          provide: getRepositoryToken(SyncGcpStoragesForProjectTrigger),
          useValue: syncStoragesTriggerRepo,
        },
      ],
    }).compile();

    service = module.get<LegacySyncTriggersService>(LegacySyncTriggersService);
  });

  describe('scheduleDataMartsSyncForStorageByGcp', () => {
    const gcpProjectId = 'test-gcp-project';

    it('should upsert trigger with correct parameters', async () => {
      syncDataMartsTriggerRepo.upsert.mockResolvedValue(undefined as never);

      await service.scheduleDataMartsSyncForStorageByGcp(gcpProjectId);

      expect(syncDataMartsTriggerRepo.upsert).toHaveBeenCalledWith(
        {
          gcpProjectId,
          status: TriggerStatus.IDLE,
          isActive: true,
        },
        {
          conflictPaths: ['gcpProjectId'],
        }
      );
    });
  });

  describe('scheduleStoragesSyncForProject', () => {
    const projectId = 'test-project';

    it('should upsert trigger with correct parameters', async () => {
      syncStoragesTriggerRepo.upsert.mockResolvedValue(undefined as never);

      await service.scheduleStoragesSyncForProject(projectId);

      expect(syncStoragesTriggerRepo.upsert).toHaveBeenCalledWith(
        {
          projectId,
          status: TriggerStatus.IDLE,
          isActive: true,
        },
        {
          conflictPaths: ['projectId'],
        }
      );
    });
  });
});
