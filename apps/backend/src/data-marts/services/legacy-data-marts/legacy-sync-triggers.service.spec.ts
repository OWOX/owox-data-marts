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
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<Repository<SyncDataMartsByGcpTrigger>>;

    syncStoragesTriggerRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
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

    it('should create new trigger when not exists', async () => {
      const newTrigger = {
        gcpProjectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      } as SyncDataMartsByGcpTrigger;

      syncDataMartsTriggerRepo.findOne.mockResolvedValue(null);
      syncDataMartsTriggerRepo.create.mockReturnValue(newTrigger);
      syncDataMartsTriggerRepo.save.mockResolvedValue(newTrigger);

      await service.scheduleDataMartsSyncForStorageByGcp(gcpProjectId);

      expect(syncDataMartsTriggerRepo.findOne).toHaveBeenCalledWith({
        where: { gcpProjectId },
      });
      expect(syncDataMartsTriggerRepo.create).toHaveBeenCalledWith({
        gcpProjectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      });
      expect(syncDataMartsTriggerRepo.save).toHaveBeenCalledWith(newTrigger);
    });

    it('should update existing trigger to active and idle', async () => {
      const existingTrigger = {
        gcpProjectId,
        status: TriggerStatus.PROCESSING,
        isActive: false,
      } as SyncDataMartsByGcpTrigger;

      syncDataMartsTriggerRepo.findOne.mockResolvedValue(existingTrigger);
      syncDataMartsTriggerRepo.save.mockResolvedValue(existingTrigger);

      await service.scheduleDataMartsSyncForStorageByGcp(gcpProjectId);

      expect(existingTrigger.status).toBe(TriggerStatus.IDLE);
      expect(existingTrigger.isActive).toBe(true);
      expect(syncDataMartsTriggerRepo.create).not.toHaveBeenCalled();
      expect(syncDataMartsTriggerRepo.save).toHaveBeenCalledWith(existingTrigger);
    });
  });

  describe('scheduleStoragesSyncForProject', () => {
    const projectId = 'test-project';

    it('should create new trigger when not exists', async () => {
      const newTrigger = {
        projectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      } as SyncGcpStoragesForProjectTrigger;

      syncStoragesTriggerRepo.findOne.mockResolvedValue(null);
      syncStoragesTriggerRepo.create.mockReturnValue(newTrigger);
      syncStoragesTriggerRepo.save.mockResolvedValue(newTrigger);

      await service.scheduleStoragesSyncForProject(projectId);

      expect(syncStoragesTriggerRepo.findOne).toHaveBeenCalledWith({
        where: { projectId },
      });
      expect(syncStoragesTriggerRepo.create).toHaveBeenCalledWith({
        projectId,
        status: TriggerStatus.IDLE,
        isActive: true,
      });
      expect(syncStoragesTriggerRepo.save).toHaveBeenCalledWith(newTrigger);
    });

    it('should update existing trigger to active and idle', async () => {
      const existingTrigger = {
        projectId,
        status: TriggerStatus.PROCESSING,
        isActive: false,
      } as SyncGcpStoragesForProjectTrigger;

      syncStoragesTriggerRepo.findOne.mockResolvedValue(existingTrigger);
      syncStoragesTriggerRepo.save.mockResolvedValue(existingTrigger);

      await service.scheduleStoragesSyncForProject(projectId);

      expect(existingTrigger.status).toBe(TriggerStatus.IDLE);
      expect(existingTrigger.isActive).toBe(true);
      expect(syncStoragesTriggerRepo.create).not.toHaveBeenCalled();
      expect(syncStoragesTriggerRepo.save).toHaveBeenCalledWith(existingTrigger);
    });
  });
});
