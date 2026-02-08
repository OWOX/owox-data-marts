import { Test, TestingModule } from '@nestjs/testing';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartService } from '../../services/data-mart.service';
import { DeleteDataMartService } from '../delete-data-mart.service';
import { DeleteLegacyDataMartService } from './delete-legacy-data-mart.service';

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

describe('DeleteLegacyDataMartService', () => {
  let service: DeleteLegacyDataMartService;
  let dataMartService: jest.Mocked<DataMartService>;
  let deleteDataMartService: jest.Mocked<DeleteDataMartService>;

  beforeEach(async () => {
    dataMartService = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<DataMartService>;

    deleteDataMartService = {
      run: jest.fn(),
    } as unknown as jest.Mocked<DeleteDataMartService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeleteLegacyDataMartService,
        { provide: DataMartService, useValue: dataMartService },
        { provide: DeleteDataMartService, useValue: deleteDataMartService },
      ],
    }).compile();

    service = module.get<DeleteLegacyDataMartService>(DeleteLegacyDataMartService);
  });

  describe('run', () => {
    it('should delete data mart when it exists', async () => {
      const dataMartId = 'dm-123';
      const projectId = 'project-456';
      const mockDataMart = { id: dataMartId, projectId } as DataMart;

      dataMartService.findById.mockResolvedValue(mockDataMart);
      deleteDataMartService.run.mockResolvedValue(undefined);

      await service.run({ id: dataMartId });

      expect(dataMartService.findById).toHaveBeenCalledWith(dataMartId);
      expect(deleteDataMartService.run).toHaveBeenCalledWith(
        expect.objectContaining({
          id: dataMartId,
          projectId,
          disableLegacySync: true,
        })
      );
    });

    it('should do nothing when data mart does not exist', async () => {
      dataMartService.findById.mockResolvedValue(null);

      await service.run({ id: 'non-existent' });

      expect(dataMartService.findById).toHaveBeenCalledWith('non-existent');
      expect(deleteDataMartService.run).not.toHaveBeenCalled();
    });
  });
});
