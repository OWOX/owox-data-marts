import { Test, TestingModule } from '@nestjs/testing';
import { DataStorage } from '../../entities/data-storage.entity';
import { LegacyDataMartsService } from '../../services/legacy-data-marts/legacy-data-marts.service';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';
import { LegacySyncTriggersService } from '../../services/legacy-data-marts/legacy-sync-triggers.service';
import { SyncLegacyGcpStoragesForProjectService } from './sync-legacy-gcp-storages-for-project.service';

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

describe('SyncLegacyGcpStoragesForProjectService', () => {
  let service: SyncLegacyGcpStoragesForProjectService;
  let legacyDataMartsService: jest.Mocked<LegacyDataMartsService>;
  let legacyDataStorageService: jest.Mocked<LegacyDataStorageService>;
  let legacySyncTriggersService: jest.Mocked<LegacySyncTriggersService>;

  const projectId = 'test-project';

  beforeEach(async () => {
    legacyDataMartsService = {
      getGcpProjectsList: jest.fn(),
    } as unknown as jest.Mocked<LegacyDataMartsService>;

    legacyDataStorageService = {
      findByGcpProjectId: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<LegacyDataStorageService>;

    legacySyncTriggersService = {
      scheduleDataMartsSyncForStorageByGcp: jest.fn(),
    } as unknown as jest.Mocked<LegacySyncTriggersService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncLegacyGcpStoragesForProjectService,
        { provide: LegacyDataMartsService, useValue: legacyDataMartsService },
        { provide: LegacyDataStorageService, useValue: legacyDataStorageService },
        { provide: LegacySyncTriggersService, useValue: legacySyncTriggersService },
      ],
    }).compile();

    service = module.get<SyncLegacyGcpStoragesForProjectService>(
      SyncLegacyGcpStoragesForProjectService
    );
  });

  describe('run', () => {
    it('should return count of GCP projects', async () => {
      const gcpProjects = ['gcp-1', 'gcp-2'];

      legacyDataMartsService.getGcpProjectsList.mockResolvedValue(gcpProjects);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(null);
      legacyDataStorageService.create.mockResolvedValue({} as DataStorage);

      const result = await service.run({ projectId });

      expect(result).toBe(2);
      expect(legacyDataMartsService.getGcpProjectsList).toHaveBeenCalledWith(projectId);
    });

    it('should create storage and schedule sync for new GCP projects', async () => {
      const gcpProjects = ['gcp-1'];

      legacyDataMartsService.getGcpProjectsList.mockResolvedValue(gcpProjects);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(null);
      legacyDataStorageService.create.mockResolvedValue({} as DataStorage);

      await service.run({ projectId });

      expect(legacyDataStorageService.create).toHaveBeenCalledWith(projectId, 'gcp-1');
      expect(legacySyncTriggersService.scheduleDataMartsSyncForStorageByGcp).toHaveBeenCalledWith(
        'gcp-1'
      );
    });

    it('should skip already linked GCP projects with same project', async () => {
      const gcpProjects = ['gcp-1'];
      const existingStorage = { id: 'storage-id', projectId } as DataStorage;

      legacyDataMartsService.getGcpProjectsList.mockResolvedValue(gcpProjects);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(existingStorage);

      await service.run({ projectId });

      expect(legacyDataStorageService.create).not.toHaveBeenCalled();
      expect(legacySyncTriggersService.scheduleDataMartsSyncForStorageByGcp).not.toHaveBeenCalled();
    });

    it('should skip GCP project linked to different project', async () => {
      const gcpProjects = ['gcp-1'];
      const existingStorage = { id: 'storage-id', projectId: 'other-project' } as DataStorage;

      legacyDataMartsService.getGcpProjectsList.mockResolvedValue(gcpProjects);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(existingStorage);

      await service.run({ projectId });

      expect(legacyDataStorageService.create).not.toHaveBeenCalled();
    });

    it('should handle empty GCP projects list', async () => {
      legacyDataMartsService.getGcpProjectsList.mockResolvedValue([]);

      const result = await service.run({ projectId });

      expect(result).toBe(0);
      expect(legacyDataStorageService.findByGcpProjectId).not.toHaveBeenCalled();
    });

    it('should process multiple GCP projects independently', async () => {
      const gcpProjects = ['gcp-1', 'gcp-2', 'gcp-3'];
      const existingStorage = { id: 'storage-id', projectId } as DataStorage;

      legacyDataMartsService.getGcpProjectsList.mockResolvedValue(gcpProjects);
      legacyDataStorageService.findByGcpProjectId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingStorage)
        .mockResolvedValueOnce(null);
      legacyDataStorageService.create.mockResolvedValue({} as DataStorage);

      await service.run({ projectId });

      expect(legacyDataStorageService.create).toHaveBeenCalledTimes(2);
      expect(legacyDataStorageService.create).toHaveBeenCalledWith(projectId, 'gcp-1');
      expect(legacyDataStorageService.create).toHaveBeenCalledWith(projectId, 'gcp-3');
    });
  });
});
