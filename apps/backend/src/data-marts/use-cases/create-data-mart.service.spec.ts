jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
}));

import { ForbiddenException } from '@nestjs/common';
import { CreateDataMartService } from './create-data-mart.service';
import { CreateDataMartCommand } from '../dto/domain/create-data-mart.command';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';

describe('CreateDataMartService', () => {
  const storage = { id: 'storage-1', type: DataStorageType.GOOGLE_BIGQUERY };
  const savedDataMart = { id: 'dm-1', technicalOwners: [], businessOwners: [] };

  const createService = () => {
    const dataMartService = {
      create: jest.fn().mockReturnValue(savedDataMart),
      save: jest.fn().mockResolvedValue(savedDataMart),
    };
    const dataStorageService = {
      getByProjectIdAndId: jest.fn().mockResolvedValue(storage),
    };
    const mapper = {
      toDomainDto: jest.fn().mockReturnValue({ id: 'dm-1' }),
    };
    const legacyDataMartService = {};
    const technicalOwnerRepository = {
      save: jest.fn().mockResolvedValue({ dataMartId: 'dm-1', userId: 'user-0' }),
    };
    const accessDecisionService = {
      canAccess: jest.fn().mockResolvedValue(true),
    };

    const service = new CreateDataMartService(
      dataMartService as never,
      dataStorageService as never,
      mapper as never,
      legacyDataMartService as never,
      technicalOwnerRepository as never,
      accessDecisionService as never
    );

    return { service, dataMartService, accessDecisionService };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set sharing defaults to false for new data mart', async () => {
    const { service, dataMartService } = createService();
    const command = new CreateDataMartCommand('proj-1', 'user-0', 'Test DM', 'storage-1');

    await service.run(command);

    expect(dataMartService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        availableForReporting: false,
        availableForMaintenance: false,
      })
    );
  });

  it('should throw ForbiddenException when user has no access to storage', async () => {
    const { service, accessDecisionService } = createService();
    accessDecisionService.canAccess.mockResolvedValue(false);

    const command = new CreateDataMartCommand('proj-1', 'user-0', 'Test DM', 'storage-1', [
      'editor',
    ]);

    await expect(service.run(command)).rejects.toThrow(ForbiddenException);
  });

  it('should allow creation when user has USE access to storage', async () => {
    const { service, accessDecisionService, dataMartService } = createService();
    accessDecisionService.canAccess.mockResolvedValue(true);

    const command = new CreateDataMartCommand('proj-1', 'user-0', 'Test DM', 'storage-1', [
      'editor',
    ]);

    await service.run(command);

    expect(dataMartService.create).toHaveBeenCalled();
  });
});
