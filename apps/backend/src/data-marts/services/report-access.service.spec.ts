jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import { ReportAccessService } from './report-access.service';

describe('ReportAccessService', () => {
  const createService = () => {
    const reportRepository = {
      findOne: jest.fn(),
    };
    const reportOwnerRepository = {
      count: jest.fn(),
    };
    const dataDestinationRepository = {
      count: jest.fn(),
    };
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
    };

    const service = new ReportAccessService(
      reportRepository as never,
      reportOwnerRepository as never,
      dataDestinationRepository as never,
      idpProjectionsFacade as never
    );

    return {
      service,
      reportRepository,
      reportOwnerRepository,
      dataDestinationRepository,
      idpProjectionsFacade,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canMutate', () => {
    it('should return true for editor role (project-wide)', async () => {
      const { service } = createService();
      const result = await service.canMutate('user-1', ['editor'], 'report-1', 'proj-1');
      expect(result).toBe(true);
    });

    it('should return true for admin role (project-wide)', async () => {
      const { service } = createService();
      const result = await service.canMutate('user-1', ['admin'], 'report-1', 'proj-1');
      expect(result).toBe(true);
    });

    it('should not check ownership for editor role', async () => {
      const { service, reportOwnerRepository } = createService();
      await service.canMutate('user-1', ['editor'], 'report-1', 'proj-1');
      expect(reportOwnerRepository.count).not.toHaveBeenCalled();
    });

    it('should return true for viewer who is an effective owner', async () => {
      const { service, reportOwnerRepository, reportRepository, dataDestinationRepository } =
        createService();
      reportOwnerRepository.count.mockResolvedValue(1);
      reportRepository.findOne.mockResolvedValue({
        id: 'report-1',
        dataDestination: { id: 'dest-1' },
        dataMart: { projectId: 'proj-1' },
      });
      dataDestinationRepository.count.mockResolvedValue(1);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(true);
    });

    it('should return false for viewer who is not an owner', async () => {
      const { service, reportOwnerRepository } = createService();
      reportOwnerRepository.count.mockResolvedValue(0);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false for viewer who is owner but ineffective (destination deleted)', async () => {
      const { service, reportOwnerRepository, reportRepository, dataDestinationRepository } =
        createService();
      reportOwnerRepository.count.mockResolvedValue(1);
      reportRepository.findOne.mockResolvedValue({
        id: 'report-1',
        dataDestination: { id: 'dest-1' },
        dataMart: { projectId: 'proj-1' },
      });
      dataDestinationRepository.count.mockResolvedValue(0);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false for viewer who is owner but report not found', async () => {
      const { service, reportOwnerRepository, reportRepository } = createService();
      reportOwnerRepository.count.mockResolvedValue(1);
      reportRepository.findOne.mockResolvedValue(null);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false for viewer who is owner but destination is null', async () => {
      const { service, reportOwnerRepository, reportRepository } = createService();
      reportOwnerRepository.count.mockResolvedValue(1);
      reportRepository.findOne.mockResolvedValue({
        id: 'report-1',
        dataDestination: null,
        dataMart: { projectId: 'proj-1' },
      });

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });
  });

  describe('isEffective', () => {
    it('should return true when destination exists and not deleted', async () => {
      const { service, dataDestinationRepository } = createService();
      dataDestinationRepository.count.mockResolvedValue(1);

      const report = { dataDestination: { id: 'dest-1' } } as never;
      const result = await service.isEffective('user-1', report);
      expect(result).toBe(true);
    });

    it('should return false when destination is soft-deleted', async () => {
      const { service, dataDestinationRepository } = createService();
      dataDestinationRepository.count.mockResolvedValue(0);

      const report = { dataDestination: { id: 'dest-1' } } as never;
      const result = await service.isEffective('user-1', report);
      expect(result).toBe(false);
    });

    it('should return false when destination is null', async () => {
      const { service } = createService();
      const report = { dataDestination: null } as never;
      const result = await service.isEffective('user-1', report);
      expect(result).toBe(false);
    });
  });

  describe('canBeOwner', () => {
    it('should return true for active project member', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'user-1', isOutbound: false },
      ]);

      const report = {} as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(true);
    });

    it('should return false for non-member', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'other-user', isOutbound: false },
      ]);

      const report = {} as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false for outbound member', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'user-1', isOutbound: true },
      ]);

      const report = {} as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(false);
    });
  });

  describe('checkMutateAccess', () => {
    it('should not throw for editor role', async () => {
      const { service } = createService();
      await expect(
        service.checkMutateAccess('user-1', ['editor'], 'report-1', 'proj-1')
      ).resolves.toBeUndefined();
    });

    it('should not throw for effective owner', async () => {
      const { service, reportOwnerRepository, reportRepository, dataDestinationRepository } =
        createService();
      reportOwnerRepository.count.mockResolvedValue(1);
      reportRepository.findOne.mockResolvedValue({
        id: 'report-1',
        dataDestination: { id: 'dest-1' },
        dataMart: { projectId: 'proj-1' },
      });
      dataDestinationRepository.count.mockResolvedValue(1);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).resolves.toBeUndefined();
    });

    it('should throw with "not an owner" message for non-owner', async () => {
      const { service, reportOwnerRepository } = createService();
      reportOwnerRepository.count.mockResolvedValue(0);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(/not an owner/i);
    });

    it('should throw with "destination" message for ineffective owner', async () => {
      const { service, reportOwnerRepository, reportRepository, dataDestinationRepository } =
        createService();
      reportOwnerRepository.count.mockResolvedValue(1);
      reportRepository.findOne.mockResolvedValue({
        id: 'report-1',
        dataDestination: { id: 'dest-1' },
        dataMart: { projectId: 'proj-1' },
      });
      dataDestinationRepository.count.mockResolvedValue(0);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(/destination.*deleted/i);
    });
  });
});
