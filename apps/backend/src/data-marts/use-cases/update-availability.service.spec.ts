jest.mock('../services/access-decision', () => {
  const actual = jest.requireActual('../services/access-decision');
  return {
    ...actual,
    AccessDecisionService: jest.fn(),
  };
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateAvailabilityService } from './update-availability.service';

describe('UpdateAvailabilityService', () => {
  const createService = () => {
    const dataMartRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const dataStorageRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const dataDestinationRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const accessDecisionService = {
      canAccess: jest.fn(),
    };

    const service = new UpdateAvailabilityService(
      dataMartRepository as never,
      dataStorageRepository as never,
      dataDestinationRepository as never,
      accessDecisionService as never
    );

    return {
      service,
      dataMartRepository,
      dataStorageRepository,
      dataDestinationRepository,
      accessDecisionService,
    };
  };

  beforeEach(() => jest.clearAllMocks());

  describe('updateDataMartSharing', () => {
    it('should throw NotFoundException when DataMart not found', async () => {
      const { service, dataMartRepository } = createService();
      dataMartRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateDataMartSharing('dm-1', 'proj-1', 'user-1', ['editor'], true, false)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user cannot configure sharing', async () => {
      const { service, dataMartRepository, accessDecisionService } = createService();
      dataMartRepository.findOne.mockResolvedValue({ id: 'dm-1' });
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(
        service.updateDataMartSharing('dm-1', 'proj-1', 'user-1', ['viewer'], true, false)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update sharing when authorized', async () => {
      const { service, dataMartRepository, accessDecisionService } = createService();
      const dm = { id: 'dm-1', availableForReporting: false, availableForMaintenance: false };
      dataMartRepository.findOne.mockResolvedValue(dm);
      accessDecisionService.canAccess.mockResolvedValue(true);

      await service.updateDataMartSharing('dm-1', 'proj-1', 'user-1', ['editor'], true, true);

      expect(dataMartRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          availableForReporting: true,
          availableForMaintenance: true,
        })
      );
    });
  });

  describe('updateStorageSharing', () => {
    it('should throw ForbiddenException when non-owner tries to configure', async () => {
      const { service, dataStorageRepository, accessDecisionService } = createService();
      dataStorageRepository.findOne.mockResolvedValue({ id: 's-1' });
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(
        service.updateStorageSharing('s-1', 'proj-1', 'user-1', ['editor'], true, false)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update storage sharing when authorized', async () => {
      const { service, dataStorageRepository, accessDecisionService } = createService();
      const storage = { id: 's-1', availableForUse: false, availableForMaintenance: false };
      dataStorageRepository.findOne.mockResolvedValue(storage);
      accessDecisionService.canAccess.mockResolvedValue(true);

      await service.updateStorageSharing('s-1', 'proj-1', 'user-1', ['editor'], true, true);

      expect(dataStorageRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          availableForUse: true,
          availableForMaintenance: true,
        })
      );
    });
  });

  describe('updateDestinationSharing', () => {
    it('should throw ForbiddenException when non-owner tries to configure', async () => {
      const { service, dataDestinationRepository, accessDecisionService } = createService();
      dataDestinationRepository.findOne.mockResolvedValue({ id: 'd-1' });
      accessDecisionService.canAccess.mockResolvedValue(false);

      await expect(
        service.updateDestinationSharing('d-1', 'proj-1', 'user-1', ['viewer'], true, false)
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update destination sharing when authorized', async () => {
      const { service, dataDestinationRepository, accessDecisionService } = createService();
      const dest = { id: 'd-1', availableForUse: false, availableForMaintenance: false };
      dataDestinationRepository.findOne.mockResolvedValue(dest);
      accessDecisionService.canAccess.mockResolvedValue(true);

      await service.updateDestinationSharing('d-1', 'proj-1', 'user-1', ['editor'], true, false);

      expect(dataDestinationRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          availableForUse: true,
          availableForMaintenance: false,
        })
      );
    });
  });
});
