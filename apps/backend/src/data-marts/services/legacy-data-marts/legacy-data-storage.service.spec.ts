import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';
import { AccessValidationException } from '../../../common/exceptions/access-validation.exception';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { DataStorage } from '../../entities/data-storage.entity';
import {
  LEGACY_DATA_STORAGE_ID_NAMESPACE,
  LegacyDataStorageService,
} from './legacy-data-storage.service';

describe('LegacyDataStorageService', () => {
  let service: LegacyDataStorageService;
  let repository: jest.Mocked<Repository<DataStorage>>;
  let configService: jest.Mocked<ConfigService>;

  const createMockRepository = (): jest.Mocked<Repository<DataStorage>> =>
    ({
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    }) as unknown as jest.Mocked<Repository<DataStorage>>;

  describe('without whitelist', () => {
    beforeEach(async () => {
      repository = createMockRepository();
      configService = {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyDataStorageService,
          { provide: getRepositoryToken(DataStorage), useValue: repository },
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      service = module.get<LegacyDataStorageService>(LegacyDataStorageService);
    });

    describe('findByGcpProjectId', () => {
      it('should return storage when found', async () => {
        const gcpProjectId = 'my-gcp-project';
        const expectedStorageId = uuidv5(gcpProjectId, LEGACY_DATA_STORAGE_ID_NAMESPACE);
        const mockStorage = { id: expectedStorageId } as DataStorage;

        repository.findOne.mockResolvedValue(mockStorage);

        const result = await service.findByGcpProjectId(gcpProjectId);

        expect(result).toBe(mockStorage);
        expect(repository.findOne).toHaveBeenCalledWith({ where: { id: expectedStorageId } });
      });

      it('should return null when storage not found', async () => {
        repository.findOne.mockResolvedValue(null);

        const result = await service.findByGcpProjectId('non-existent');

        expect(result).toBeNull();
      });
    });

    describe('create', () => {
      it('should create storage with correct properties', async () => {
        const projectId = 'project-123';
        const gcpProjectId = 'my-gcp-project';
        const expectedStorageId = uuidv5(gcpProjectId, LEGACY_DATA_STORAGE_ID_NAMESPACE);
        const mockStorage = { id: expectedStorageId } as DataStorage;

        repository.create.mockReturnValue(mockStorage);
        repository.save.mockResolvedValue(mockStorage);

        const result = await service.create(projectId, gcpProjectId);

        expect(result).toBe(mockStorage);
        expect(repository.create).toHaveBeenCalledWith({
          id: expectedStorageId,
          type: DataStorageType.LEGACY_GOOGLE_BIGQUERY,
          projectId,
          title: gcpProjectId,
          config: {
            projectId: gcpProjectId,
            location: 'AUTODETECT',
          },
        });
        expect(repository.save).toHaveBeenCalledWith(mockStorage);
      });

      it('should allow any project when whitelist is not configured', async () => {
        const projectId = 'any-project';
        const gcpProjectId = 'any-gcp';
        const mockStorage = { id: 'storage-id' } as DataStorage;

        repository.create.mockReturnValue(mockStorage);
        repository.save.mockResolvedValue(mockStorage);

        await expect(service.create(projectId, gcpProjectId)).resolves.toBe(mockStorage);
      });
    });
  });

  describe('with whitelist', () => {
    const whitelistedProject = 'allowed-project';

    beforeEach(async () => {
      repository = createMockRepository();
      configService = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'LEGACY_DATA_MARTS_WHITELIST_PROJECTS') {
            return `${whitelistedProject}, another-allowed`;
          }
          return undefined;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          LegacyDataStorageService,
          { provide: getRepositoryToken(DataStorage), useValue: repository },
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      service = module.get<LegacyDataStorageService>(LegacyDataStorageService);
    });

    describe('create', () => {
      it('should allow whitelisted project', async () => {
        const mockStorage = { id: 'storage-id' } as DataStorage;
        repository.create.mockReturnValue(mockStorage);
        repository.save.mockResolvedValue(mockStorage);

        await expect(service.create(whitelistedProject, 'gcp-project')).resolves.toBe(mockStorage);
      });

      it('should throw AccessValidationException for non-whitelisted project', async () => {
        await expect(service.create('not-allowed-project', 'gcp-project')).rejects.toThrow(
          AccessValidationException
        );
      });
    });
  });
});
