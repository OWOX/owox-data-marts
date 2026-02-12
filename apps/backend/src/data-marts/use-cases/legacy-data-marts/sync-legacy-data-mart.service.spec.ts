import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import { DataMartsDetailsOdmResponseDto } from '../../dto/domain/legacy-data-marts/data-mart-details-odm.response.dto';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataMartService } from '../../services/data-mart.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts/legacy-data-marts.service';
import { LegacyDataStorageService } from '../../services/legacy-data-marts/legacy-data-storage.service';
import { LegacySyncTriggersService } from '../../services/legacy-data-marts/legacy-sync-triggers.service';
import { DeleteLegacyDataMartService } from './delete-legacy-data-mart.service';
import { SyncLegacyDataMartService } from './sync-legacy-data-mart.service';

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

describe('SyncLegacyDataMartService', () => {
  let service: SyncLegacyDataMartService;
  let dataMartService: jest.Mocked<DataMartService>;
  let legacyDataMartsService: jest.Mocked<LegacyDataMartsService>;
  let legacyDataStorageService: jest.Mocked<LegacyDataStorageService>;
  let legacySyncTriggersService: jest.Mocked<LegacySyncTriggersService>;
  let deleteLegacyDataMartService: jest.Mocked<DeleteLegacyDataMartService>;

  const mockProjection: DataMartsDetailsOdmResponseDto = {
    id: 'dm-123',
    title: 'Test Data Mart',
    description: 'Test description',
    query: 'SELECT 1',
    gcpProjectId: 'gcp-project',
    projectId: 'project-id',
    createdAt: new Date(),
    modifiedAt: new Date(),
  };

  const mockStorage = {
    id: 'storage-id',
    projectId: 'project-id',
  } as DataStorage;

  beforeEach(async () => {
    dataMartService = {
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    } as unknown as jest.Mocked<DataMartService>;

    legacyDataMartsService = {
      getDataMartDetails: jest.fn(),
    } as unknown as jest.Mocked<LegacyDataMartsService>;

    legacyDataStorageService = {
      findByGcpProjectId: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<LegacyDataStorageService>;

    legacySyncTriggersService = {
      scheduleDataMartsSyncForStorageByGcp: jest.fn(),
      scheduleStoragesSyncForProject: jest.fn(),
    } as unknown as jest.Mocked<LegacySyncTriggersService>;

    deleteLegacyDataMartService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<DeleteLegacyDataMartService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncLegacyDataMartService,
        { provide: DataMartService, useValue: dataMartService },
        { provide: LegacyDataMartsService, useValue: legacyDataMartsService },
        { provide: LegacyDataStorageService, useValue: legacyDataStorageService },
        { provide: LegacySyncTriggersService, useValue: legacySyncTriggersService },
        { provide: DeleteLegacyDataMartService, useValue: deleteLegacyDataMartService },
      ],
    }).compile();

    service = module.get<SyncLegacyDataMartService>(SyncLegacyDataMartService);
  });

  describe('run', () => {
    it('should delete data mart when not found in legacy system', async () => {
      legacyDataMartsService.getDataMartDetails.mockRejectedValue(new NotFoundException());

      await service.run({ dataMartId: 'dm-123' });

      expect(deleteLegacyDataMartService.run).toHaveBeenCalledWith({ id: 'dm-123' });
      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('should use provided storage when available in command', async () => {
      legacyDataMartsService.getDataMartDetails.mockResolvedValue(mockProjection);
      dataMartService.findById.mockResolvedValue(null);
      dataMartService.create.mockReturnValue({ id: 'dm-123' } as DataMart);

      await service.run({ dataMartId: 'dm-123', storage: mockStorage });

      expect(legacyDataStorageService.findByGcpProjectId).not.toHaveBeenCalled();
      expect(dataMartService.save).toHaveBeenCalled();
    });

    it('should find existing storage by GCP project ID', async () => {
      legacyDataMartsService.getDataMartDetails.mockResolvedValue(mockProjection);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(mockStorage);
      dataMartService.findById.mockResolvedValue(null);
      dataMartService.create.mockReturnValue({ id: 'dm-123' } as DataMart);

      await service.run({ dataMartId: 'dm-123' });

      expect(legacyDataStorageService.findByGcpProjectId).toHaveBeenCalledWith('gcp-project');
      expect(legacyDataStorageService.create).not.toHaveBeenCalled();
      expect(dataMartService.save).toHaveBeenCalled();
    });

    it('should create new storage and schedule sync when storage not found', async () => {
      legacyDataMartsService.getDataMartDetails.mockResolvedValue(mockProjection);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(null);
      legacyDataStorageService.create.mockResolvedValue(mockStorage);
      dataMartService.findById.mockResolvedValue(null);
      dataMartService.create.mockReturnValue({ id: 'dm-123' } as DataMart);

      await service.run({ dataMartId: 'dm-123' });

      expect(legacyDataStorageService.create).toHaveBeenCalledWith('project-id', 'gcp-project');
      expect(legacySyncTriggersService.scheduleDataMartsSyncForStorageByGcp).toHaveBeenCalledWith(
        'gcp-project'
      );
      expect(legacySyncTriggersService.scheduleStoragesSyncForProject).toHaveBeenCalledWith(
        'project-id'
      );
    });

    it('should update existing data mart', async () => {
      const existingDataMart = {
        id: 'dm-123',
        title: 'Old Title',
        deletedAt: new Date(),
      } as DataMart;

      legacyDataMartsService.getDataMartDetails.mockResolvedValue(mockProjection);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(mockStorage);
      dataMartService.findById.mockResolvedValue(existingDataMart);

      await service.run({ dataMartId: 'dm-123' });

      expect(dataMartService.create).not.toHaveBeenCalled();
      expect(existingDataMart.deletedAt).toBeUndefined();
      expect(existingDataMart.title).toBe('Test Data Mart');
      expect(dataMartService.save).toHaveBeenCalledWith(existingDataMart);
    });

    it('should silently skip when AccessValidationException is thrown', async () => {
      legacyDataMartsService.getDataMartDetails.mockResolvedValue(mockProjection);
      legacyDataStorageService.findByGcpProjectId.mockResolvedValue(null);
      legacyDataStorageService.create.mockRejectedValue(
        new AccessValidationException('Not allowed')
      );

      // Should not throw
      await service.run({ dataMartId: 'dm-123' });

      expect(dataMartService.save).not.toHaveBeenCalled();
    });

    it('should rethrow non-access errors', async () => {
      legacyDataMartsService.getDataMartDetails.mockRejectedValue(new Error('Network error'));

      await expect(service.run({ dataMartId: 'dm-123' })).rejects.toThrow('Network error');
    });
  });
});
