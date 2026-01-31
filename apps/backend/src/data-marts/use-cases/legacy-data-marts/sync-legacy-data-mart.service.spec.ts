import { NotFoundException } from '@nestjs/common';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataMartMapper } from '../../mappers/data-mart.mapper';
import { DataMartService } from '../../services/data-mart.service';
import { DataStorageService } from '../../services/data-storage.service';
import { LegacyDataMartsService } from '../../services/legacy-data-marts.service';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { SyncLegacyDataMartService } from './sync-legacy-data-mart.service';
import { SyncLegacyDataMartCommand } from '../../dto/domain/sync-legacy-data-mart.command';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';

jest.mock('@owox/internal-helpers', () => ({
  fetchWithBackoff: jest.fn(),
  ImpersonatedIdTokenFetcher: class {
    getIdToken = jest.fn().mockResolvedValue('token');
  },
}));

describe('SyncLegacyDataMartService', () => {
  const dataStorageService = {
    getOrCreateLegacyStorage: jest.fn(),
  } as unknown as DataStorageService;
  const legacyDataMartsService = {
    getDataMartDetails: jest.fn(),
  } as unknown as LegacyDataMartsService;
  const dataMartService = {
    getByIdAndProjectIdIncludingDeleted: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softDeleteByIdAndProjectId: jest.fn(),
  } as unknown as DataMartService;
  const mapper = {
    toDomainDto: jest.fn(),
  } as unknown as DataMartMapper;

  const createService = () =>
    new SyncLegacyDataMartService(
      legacyDataMartsService,
      dataMartService,
      mapper,
      dataStorageService
    );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses provided storage without calling dataStorageService', async () => {
    const service = createService();
    const storage = { id: 'provided-storage' } as DataStorage;
    legacyDataMartsService.getDataMartDetails = jest.fn().mockResolvedValue({
      id: 'legacy-id',
      title: 'Legacy Title',
      description: null,
      query: 'select 1',
      gcpProjectId: 'gcp-id',
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    dataMartService.getByIdAndProjectId = jest.fn().mockRejectedValue(new NotFoundException());
    dataMartService.create = jest.fn().mockImplementation(data => data);
    dataMartService.save = jest.fn().mockResolvedValue(undefined);
    mapper.toDomainDto = jest.fn().mockReturnValue({ id: 'legacy-id' });

    await service.run(new SyncLegacyDataMartCommand('project-id', 'gcp-id', 'legacy-id', storage));

    expect(dataStorageService.getOrCreateLegacyStorage).not.toHaveBeenCalled();
  });

  it('creates data mart when not found', async () => {
    const service = createService();
    legacyDataMartsService.getDataMartDetails = jest.fn().mockResolvedValue({
      id: 'legacy-id',
      title: 'Legacy Title',
      description: null,
      query: 'select 1',
      gcpProjectId: 'gcp-id',
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    dataMartService.getByIdAndProjectId = jest.fn().mockRejectedValue(new NotFoundException());
    dataMartService.create = jest.fn().mockImplementation(data => data);
    dataMartService.save = jest.fn().mockResolvedValue(undefined);
    mapper.toDomainDto = jest.fn().mockReturnValue({ id: 'legacy-id' });
    dataStorageService.getOrCreateLegacyStorage = jest.fn().mockResolvedValue({ id: 'storage-id' });

    const result = await service.run(
      new SyncLegacyDataMartCommand('project-id', 'gcp-id', 'legacy-id')
    );

    expect(dataMartService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'legacy-id',
        projectId: 'project-id',
        definitionType: DataMartDefinitionType.SQL,
        definition: { sqlQuery: 'select 1' },
      })
    );
    expect(result).toEqual({ id: 'legacy-id' });
  });

  it('soft deletes existing data mart when legacy returns 404', async () => {
    const service = createService();
    const existingDataMart = { id: 'legacy-id' } as DataMart;
    legacyDataMartsService.getDataMartDetails = jest
      .fn()
      .mockRejectedValue(new BusinessViolationException('Not found', { status: 404 }));
    dataMartService.getByIdAndProjectId = jest.fn().mockResolvedValue(existingDataMart);
    dataMartService.softDeleteByIdAndProjectId = jest.fn().mockResolvedValue(undefined);
    mapper.toDomainDto = jest.fn().mockReturnValue({ id: 'legacy-id' });

    const result = await service.run(
      new SyncLegacyDataMartCommand('project-id', 'gcp-id', 'legacy-id')
    );

    expect(dataMartService.softDeleteByIdAndProjectId).toHaveBeenCalledWith(
      'legacy-id',
      'project-id'
    );
    expect(dataStorageService.getOrCreateLegacyStorage).not.toHaveBeenCalled();
    expect(dataMartService.save).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'legacy-id' });
  });

  it('restores soft deleted data mart during sync', async () => {
    const service = createService();
    const storage = { id: 'storage-id' } as DataStorage;
    const existingDataMart = { id: 'legacy-id', deletedAt: new Date() } as DataMart;
    legacyDataMartsService.getDataMartDetails = jest.fn().mockResolvedValue({
      id: 'legacy-id',
      title: 'Legacy Title',
      description: null,
      query: 'select 1',
      gcpProjectId: 'gcp-id',
      createdAt: new Date(),
      modifiedAt: new Date(),
    });
    dataStorageService.getOrCreateLegacyStorage = jest.fn().mockResolvedValue(storage);
    dataMartService.getByIdAndProjectId = jest.fn().mockResolvedValue(existingDataMart);
    dataMartService.save = jest.fn().mockResolvedValue(undefined);
    mapper.toDomainDto = jest.fn().mockReturnValue({ id: 'legacy-id' });

    await service.run(new SyncLegacyDataMartCommand('project-id', 'gcp-id', 'legacy-id'));

    expect(existingDataMart.deletedAt).toBeUndefined();
    expect(dataMartService.save).toHaveBeenCalledWith(existingDataMart);
  });
});
