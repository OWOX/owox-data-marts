import { Test, TestingModule } from '@nestjs/testing';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataMartService } from '../../services/data-mart.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts/legacy-data-marts.service';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';
import { DeleteDataMartService } from '../delete-data-mart.service';
import { SyncLegacyDataMartService } from './sync-legacy-data-mart.service';
import { SyncLegacyDataMartsByGcpService } from './sync-legacy-data-marts-by-gcp.service';

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

describe('SyncLegacyDataMartsByGcpService', () => {
  let service: SyncLegacyDataMartsByGcpService;
  let legacyDataMartsService: jest.Mocked<LegacyDataMartsService>;
  let syncLegacyDataMartService: jest.Mocked<SyncLegacyDataMartService>;
  let legacyDataStorageService: jest.Mocked<LegacyDataStorageService>;
  let dataMartService: jest.Mocked<DataMartService>;
  let deleteDataMartService: jest.Mocked<DeleteDataMartService>;

  const mockStorage = {
    id: 'storage-id',
    projectId: 'project-id',
  } as DataStorage;

  beforeEach(async () => {
    legacyDataMartsService = {
      getDataMartsList: jest.fn(),
    } as unknown as jest.Mocked<LegacyDataMartsService>;

    syncLegacyDataMartService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<SyncLegacyDataMartService>;

    legacyDataStorageService = {
      findByGcpProjectId: jest.fn(),
    } as unknown as jest.Mocked<LegacyDataStorageService>;

    dataMartService = {
      findIdsByStorage: jest.fn(),
    } as unknown as jest.Mocked<DataMartService>;

    deleteDataMartService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<DeleteDataMartService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncLegacyDataMartsByGcpService,
        { provide: LegacyDataMartsService, useValue: legacyDataMartsService },
        { provide: SyncLegacyDataMartService, useValue: syncLegacyDataMartService },
        { provide: LegacyDataStorageService, useValue: legacyDataStorageService },
        { provide: DataMartService, useValue: dataMartService },
        { provide: DeleteDataMartService, useValue: deleteDataMartService },
      ],
    }).compile();

    service = module.get<SyncLegacyDataMartsByGcpService>(SyncLegacyDataMartsByGcpService);
  });

  describe('run', () => {
    it('should throw error when storage not found', async () => {
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(null);

      await expect(service.run({ gcpProjectId: 'gcp-project' })).rejects.toThrow(
        "Legacy storage not found for GCP 'gcp-project'"
      );
    });

    it('should sync all legacy data marts', async () => {
      const legacyIds = ['dm-1', 'dm-2', 'dm-3'];

      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(mockStorage);
      dataMartService.findIdsByStorage.mockResolvedValue([]);
      legacyDataMartsService.getDataMartsList.mockResolvedValue(legacyIds);

      const result = await service.run({ gcpProjectId: 'gcp-project' });

      expect(result).toBe(3);
      expect(syncLegacyDataMartService.run).toHaveBeenCalledTimes(3);
      expect(syncLegacyDataMartService.run).toHaveBeenCalledWith(
        expect.objectContaining({ dataMartId: 'dm-1', storage: mockStorage })
      );
      expect(syncLegacyDataMartService.run).toHaveBeenCalledWith(
        expect.objectContaining({ dataMartId: 'dm-2', storage: mockStorage })
      );
      expect(syncLegacyDataMartService.run).toHaveBeenCalledWith(
        expect.objectContaining({ dataMartId: 'dm-3', storage: mockStorage })
      );
    });

    it('should delete data marts that no longer exist in legacy system', async () => {
      const legacyIds = ['dm-1'];
      const existingIds = ['dm-1', 'dm-2', 'dm-3'];

      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(mockStorage);
      dataMartService.findIdsByStorage.mockResolvedValue(existingIds);
      legacyDataMartsService.getDataMartsList.mockResolvedValue(legacyIds);

      await service.run({ gcpProjectId: 'gcp-project' });

      expect(deleteDataMartService.run).toHaveBeenCalledTimes(2);
      expect(deleteDataMartService.run).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'dm-2', disableLegacySync: true })
      );
      expect(deleteDataMartService.run).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'dm-3', disableLegacySync: true })
      );
    });

    it('should handle empty legacy data marts list', async () => {
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(mockStorage);
      dataMartService.findIdsByStorage.mockResolvedValue(['dm-1']);
      legacyDataMartsService.getDataMartsList.mockResolvedValue([]);

      const result = await service.run({ gcpProjectId: 'gcp-project' });

      expect(result).toBe(0);
      expect(syncLegacyDataMartService.run).not.toHaveBeenCalled();
      expect(deleteDataMartService.run).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'dm-1' })
      );
    });

    it('should not delete data marts that exist in both systems', async () => {
      const legacyIds = ['dm-1', 'dm-2'];
      const existingIds = ['dm-1', 'dm-2'];

      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(mockStorage);
      dataMartService.findIdsByStorage.mockResolvedValue(existingIds);
      legacyDataMartsService.getDataMartsList.mockResolvedValue(legacyIds);

      await service.run({ gcpProjectId: 'gcp-project' });

      expect(deleteDataMartService.run).not.toHaveBeenCalled();
    });
  });
});
