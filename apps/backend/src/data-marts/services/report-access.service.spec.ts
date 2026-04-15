jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('./access-decision', () => {
  const actual = jest.requireActual('./access-decision');
  return {
    ...actual,
    AccessDecisionService: jest.fn(),
  };
});

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
    const accessDecisionService = {
      canAccess: jest.fn(),
    };

    const service = new ReportAccessService(
      reportRepository as never,
      reportOwnerRepository as never,
      dataDestinationRepository as never,
      idpProjectionsFacade as never,
      accessDecisionService as never
    );

    return {
      service,
      reportRepository,
      reportOwnerRepository,
      dataDestinationRepository,
      idpProjectionsFacade,
      accessDecisionService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockReport = {
    id: 'report-1',
    dataMart: { id: 'dm-1', projectId: 'proj-1' },
    dataDestination: { id: 'dest-1' },
  };

  describe('canMutate', () => {
    it('should return true for user with DM maintenance access (tech owner)', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      // canSeeDm = true, hasDmMaintenance = true
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(true); // EDIT DM (maintenance)

      const result = await service.canMutate('user-1', ['editor'], 'report-1', 'proj-1');
      expect(result).toBe(true);
    });

    it('should return false when DM is invisible to editor', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(false); // SEE DM = false

      const result = await service.canMutate('user-1', ['editor'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should NOT auto-allow editor without DM ownership (project-wide bypass removed)', async () => {
      const { service, reportRepository, reportOwnerRepository, accessDecisionService } =
        createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      // canSeeDm = true (via shared_for_reporting), hasDmMaintenance = false
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(false); // EDIT DM (no maintenance)
      // Not a report owner
      reportOwnerRepository.count.mockResolvedValue(0);

      const result = await service.canMutate('user-1', ['editor'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should return true for report owner who is effective', async () => {
      const {
        service,
        reportRepository,
        reportOwnerRepository,
        dataDestinationRepository,
        accessDecisionService,
      } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(false); // EDIT DM
      reportOwnerRepository.count.mockResolvedValue(1);
      dataDestinationRepository.count.mockResolvedValue(1);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(true);
    });

    it('should return false for report owner who is ineffective (destination deleted)', async () => {
      const {
        service,
        reportRepository,
        reportOwnerRepository,
        dataDestinationRepository,
        accessDecisionService,
      } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(false); // EDIT DM
      reportOwnerRepository.count.mockResolvedValue(1);
      dataDestinationRepository.count.mockResolvedValue(0);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false when report not found', async () => {
      const { service, reportRepository } = createService();
      reportRepository.findOne.mockResolvedValue(null);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should return true for admin (DM always visible, maintenance access)', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(true); // EDIT DM

      const result = await service.canMutate('user-1', ['admin'], 'report-1', 'proj-1');
      expect(result).toBe(true);
    });
  });

  describe('isEffective', () => {
    it('should return true when destination exists', async () => {
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
    it('should return true for active project member with DM access', async () => {
      const { service, idpProjectionsFacade, accessDecisionService } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'user-1', isOutbound: false, role: 'editor' },
      ]);
      accessDecisionService.canAccess.mockResolvedValue(true);

      const report = { dataMart: { id: 'dm-1' } } as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(true);
    });

    it('should return false for non-member', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'other-user', isOutbound: false },
      ]);

      const report = { dataMart: { id: 'dm-1' } } as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false for outbound member', async () => {
      const { service, idpProjectionsFacade } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'user-1', isOutbound: true },
      ]);

      const report = { dataMart: { id: 'dm-1' } } as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false for member without DM access', async () => {
      const { service, idpProjectionsFacade, accessDecisionService } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'user-1', isOutbound: false, role: 'viewer' },
      ]);
      accessDecisionService.canAccess.mockResolvedValue(false); // No DM SEE

      const report = { dataMart: { id: 'dm-1' } } as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(false);
    });
  });

  describe('checkMutateAccess', () => {
    it('should not throw for user with DM maintenance access', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

      await expect(
        service.checkMutateAccess('user-1', ['editor'], 'report-1', 'proj-1')
      ).resolves.toBeUndefined();
    });

    it('should throw ForbiddenException with "not an owner" message', async () => {
      const { service, reportRepository, reportOwnerRepository, accessDecisionService } =
        createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      reportOwnerRepository.count.mockResolvedValue(0);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(ForbiddenException);

      // Reset mocks for second assertion
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      reportOwnerRepository.count.mockResolvedValue(0);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(/not an owner/i);
    });

    it('should throw with "destination" message for ineffective owner', async () => {
      const {
        service,
        reportRepository,
        reportOwnerRepository,
        dataDestinationRepository,
        accessDecisionService,
      } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      reportOwnerRepository.count.mockResolvedValue(1);
      dataDestinationRepository.count.mockResolvedValue(0);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(ForbiddenException);

      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      reportOwnerRepository.count.mockResolvedValue(1);
      dataDestinationRepository.count.mockResolvedValue(0);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(/destination.*deleted/i);
    });
  });
});
