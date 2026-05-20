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
      exist: jest.fn(),
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
      idpProjectionsFacade as never,
      accessDecisionService as never
    );

    return {
      service,
      reportRepository,
      reportOwnerRepository,
      idpProjectionsFacade,
      accessDecisionService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockReport = {
    id: 'report-1',
    dataMart: { id: 'dm-1', projectId: 'proj-1', storage: { id: 'storage-1' } },
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
      reportOwnerRepository.exist.mockResolvedValue(false);

      const result = await service.canMutate('user-1', ['editor'], 'report-1', 'proj-1');
      expect(result).toBe(false);
    });

    it('should return true for report owner who is effective', async () => {
      const { service, reportRepository, reportOwnerRepository, accessDecisionService } =
        createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(false) // EDIT DM
        .mockResolvedValueOnce(true); // USE Destination (effective)
      reportOwnerRepository.exist.mockResolvedValue(true);

      const result = await service.canMutate('user-1', ['viewer'], 'report-1', 'proj-1');
      expect(result).toBe(true);
    });

    it('should return false for report owner who is ineffective (destination deleted)', async () => {
      const { service, reportRepository, reportOwnerRepository, accessDecisionService } =
        createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(false) // EDIT DM
        .mockResolvedValueOnce(false); // USE Destination (ineffective)
      reportOwnerRepository.exist.mockResolvedValue(true);

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
    it('should return true when user has USE access to destination', async () => {
      const { service, accessDecisionService } = createService();
      accessDecisionService.canAccess.mockResolvedValue(true);

      const report = { dataDestination: { id: 'dest-1' } } as never;
      const result = await service.isEffective('user-1', report, ['viewer'], 'proj-1');
      expect(result).toBe(true);
    });

    it('should return false when user lacks USE access to destination', async () => {
      const { service, accessDecisionService } = createService();
      accessDecisionService.canAccess.mockResolvedValue(false);

      const report = { dataDestination: { id: 'dest-1' } } as never;
      const result = await service.isEffective('user-1', report, ['viewer'], 'proj-1');
      expect(result).toBe(false);
    });

    it('should return false when destination is null', async () => {
      const { service } = createService();
      const report = { dataDestination: null } as never;
      const result = await service.isEffective('user-1', report, ['viewer'], 'proj-1');
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

    it('should return false when user has DM access but no Destination access', async () => {
      const { service, idpProjectionsFacade, accessDecisionService } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'user-1', isOutbound: false, role: 'editor' },
      ]);
      accessDecisionService.canAccess.mockImplementation(
        async (_userId, _roles, entityType, _entityId, _action, _projectId) => {
          if (entityType === 'DATA_MART') return true; // DM SEE
          if (entityType === 'DESTINATION') return false; // DESTINATION USE
          return false;
        }
      );

      const report = { dataMart: { id: 'dm-1' }, dataDestination: { id: 'dest-1' } } as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(false);
    });

    it('should return true when user has both DM and Destination access', async () => {
      const { service, idpProjectionsFacade, accessDecisionService } = createService();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'user-1', isOutbound: false, role: 'editor' },
      ]);
      accessDecisionService.canAccess.mockImplementation(
        async (_userId, _roles, entityType, _entityId, _action, _projectId) => {
          if (entityType === 'DATA_MART') return true; // DM SEE
          if (entityType === 'DESTINATION') return true; // DESTINATION USE
          return false;
        }
      );

      const report = { dataMart: { id: 'dm-1' }, dataDestination: { id: 'dest-1' } } as never;
      const result = await service.canBeOwner('user-1', report, 'proj-1');
      expect(result).toBe(true);
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
      reportOwnerRepository.exist.mockResolvedValue(false);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(ForbiddenException);

      // Reset mocks for second assertion
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      reportOwnerRepository.exist.mockResolvedValue(false);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(/not an owner/i);
    });

    it('should throw with "destination" message for ineffective owner', async () => {
      const { service, reportRepository, reportOwnerRepository, accessDecisionService } =
        createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(false) // EDIT DM
        .mockResolvedValueOnce(false); // USE Destination (ineffective)
      reportOwnerRepository.exist.mockResolvedValue(true);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(ForbiddenException);

      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);
      reportOwnerRepository.exist.mockResolvedValue(true);

      await expect(
        service.checkMutateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toThrow(/destination.*not accessible/i);
    });
  });

  describe('canOperate', () => {
    const buildOperateMocks = (canSeeDm: boolean, canUseDest: boolean) => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockImplementation(
        async (
          _userId: string,
          _roles: string[],
          entityType: string,
          _entityId: string,
          action: string,
          _projectId: string
        ) => {
          if (entityType === 'DATA_MART' && action === 'SEE') return canSeeDm;
          if (entityType === 'DESTINATION' && action === 'USE') return canUseDest;
          return false;
        }
      );
      return { service, accessDecisionService };
    };

    it('returns true when user can see DM and use Destination', async () => {
      const { service } = buildOperateMocks(true, true);
      await expect(service.canOperate('user-1', ['viewer'], 'report-1', 'proj-1')).resolves.toBe(
        true
      );
    });

    it('returns false when DM is invisible', async () => {
      const { service } = buildOperateMocks(false, true);
      await expect(service.canOperate('user-1', ['viewer'], 'report-1', 'proj-1')).resolves.toBe(
        false
      );
    });

    it('returns false when Destination is not usable', async () => {
      const { service } = buildOperateMocks(true, false);
      await expect(service.canOperate('user-1', ['viewer'], 'report-1', 'proj-1')).resolves.toBe(
        false
      );
    });

    it('returns false when report does not exist', async () => {
      const { service, reportRepository } = createService();
      reportRepository.findOne.mockResolvedValue(null);
      await expect(service.canOperate('user-1', ['viewer'], 'report-1', 'proj-1')).resolves.toBe(
        false
      );
    });

    it('returns false when report has no destination assigned', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue({
        ...mockReport,
        dataDestination: null,
      });
      accessDecisionService.canAccess.mockResolvedValueOnce(true); // SEE DM
      await expect(service.canOperate('user-1', ['viewer'], 'report-1', 'proj-1')).resolves.toBe(
        false
      );
    });
  });

  describe('checkOperateAccess', () => {
    it('throws ForbiddenException with dm-invisible reason', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValueOnce(false); // SEE DM = false
      await expect(
        service.checkOperateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ForbiddenException with destination-unusable reason', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess
        .mockResolvedValueOnce(true) // SEE DM
        .mockResolvedValueOnce(false); // USE Destination
      await expect(
        service.checkOperateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('passes when both DM SEE and Destination USE are allowed', async () => {
      const { service, reportRepository, accessDecisionService } = createService();
      reportRepository.findOne.mockResolvedValue(mockReport);
      accessDecisionService.canAccess.mockResolvedValue(true);
      await expect(
        service.checkOperateAccess('user-1', ['viewer'], 'report-1', 'proj-1')
      ).resolves.toBeUndefined();
    });
  });

  describe('computeCapabilitiesForReport', () => {
    it('returns EMPTY_CAPABILITIES when userId is undefined', async () => {
      const { service } = createService();
      const result = await service.computeCapabilitiesForReport(
        undefined,
        [],
        mockReport as never,
        'proj-1'
      );
      expect(result).toEqual({
        canRun: false,
        canManageTriggers: false,
        canEditConfig: false,
        canViewSql: false,
        canCopyAsDataMart: false,
      });
    });

    it('sets canViewSql=true only when user has EDIT on DM', async () => {
      const { service, accessDecisionService } = createService();
      accessDecisionService.canAccess.mockImplementation(
        async (_userId, _roles, entityType, _entityId, action) => {
          if (entityType === 'DATA_MART' && action === 'SEE') return true;
          if (entityType === 'DATA_MART' && action === 'EDIT') return true;
          if (entityType === 'DESTINATION' && action === 'USE') return true;
          if (entityType === 'STORAGE' && action === 'USE') return false;
          return false;
        }
      );
      const result = await service.computeCapabilitiesForReport(
        'user-1',
        ['editor'],
        mockReport as never,
        'proj-1'
      );
      expect(result.canViewSql).toBe(true);
      expect(result.canCopyAsDataMart).toBe(false);
    });

    it('sets canCopyAsDataMart=true only when user has both EDIT(DM) and USE(Storage)', async () => {
      const { service, accessDecisionService } = createService();
      accessDecisionService.canAccess.mockImplementation(
        async (_userId, _roles, entityType, _entityId, action) => {
          if (entityType === 'DATA_MART' && action === 'SEE') return true;
          if (entityType === 'DATA_MART' && action === 'EDIT') return true;
          if (entityType === 'DESTINATION' && action === 'USE') return true;
          if (entityType === 'STORAGE' && action === 'USE') return true;
          return false;
        }
      );
      const result = await service.computeCapabilitiesForReport(
        'user-1',
        ['editor'],
        mockReport as never,
        'proj-1'
      );
      expect(result.canViewSql).toBe(true);
      expect(result.canCopyAsDataMart).toBe(true);
    });

    it('sets canViewSql=false when user lacks EDIT on DM even if other flags are true', async () => {
      const { service, reportOwnerRepository, accessDecisionService } = createService();
      reportOwnerRepository.exist.mockResolvedValue(true);
      accessDecisionService.canAccess.mockImplementation(
        async (_userId, _roles, entityType, _entityId, action) => {
          if (entityType === 'DATA_MART' && action === 'SEE') return true;
          if (entityType === 'DATA_MART' && action === 'EDIT') return false;
          if (entityType === 'DESTINATION' && action === 'USE') return true;
          if (entityType === 'STORAGE' && action === 'USE') return true;
          return false;
        }
      );
      const result = await service.computeCapabilitiesForReport(
        'user-1',
        ['viewer'],
        mockReport as never,
        'proj-1'
      );
      expect(result.canViewSql).toBe(false);
      expect(result.canCopyAsDataMart).toBe(false);
    });
  });
});
