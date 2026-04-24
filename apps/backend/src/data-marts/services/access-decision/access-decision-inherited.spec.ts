jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { AccessDecisionService } from './access-decision.service';
import { ContextAccessService } from '../context/context-access.service';
import { RoleScope } from '../../enums/role-scope.enum';
import { Action } from './access-decision.types';

describe('AccessDecisionService — inherited entity access (DM Trigger, Report)', () => {
  const createService = () => {
    const dataMartRepository = { findOne: jest.fn() };
    const dataStorageRepository = { findOne: jest.fn() };
    const dataDestinationRepository = { findOne: jest.fn() };
    const dataMartTechnicalOwnerRepository = { count: jest.fn() };
    const dataMartBusinessOwnerRepository = { count: jest.fn() };
    const storageOwnerRepository = { count: jest.fn() };
    const destinationOwnerRepository = { count: jest.fn() };
    const reportOwnerRepository = { count: jest.fn() };
    const reportRepository = { findOne: jest.fn() };
    const contextAccessService = {
      getRoleScope: jest.fn().mockResolvedValue(RoleScope.ENTIRE_PROJECT),
      hasContextOverlap: jest.fn().mockResolvedValue(true),
    };

    const service = new AccessDecisionService(
      dataMartRepository as never,
      dataStorageRepository as never,
      dataDestinationRepository as never,
      dataMartTechnicalOwnerRepository as never,
      dataMartBusinessOwnerRepository as never,
      storageOwnerRepository as never,
      destinationOwnerRepository as never,
      reportOwnerRepository as never,
      reportRepository as never,
      contextAccessService as unknown as ContextAccessService
    );

    return {
      service,
      dataMartRepository,
      dataMartTechnicalOwnerRepository,
      dataMartBusinessOwnerRepository,
      reportRepository,
      reportOwnerRepository,
      dataDestinationRepository,
      contextAccessService,
    };
  };

  describe('canAccessDmTrigger', () => {
    it('should allow SEE when user can SEE parent DM', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessDmTrigger(
        'user-1',
        ['editor'],
        'trigger-1',
        'dm-1',
        Action.SEE,
        'proj-1'
      );
      expect(result).toBe(true);
    });

    it('should deny SEE when user cannot SEE parent DM', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: false,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessDmTrigger(
        'user-1',
        ['editor'],
        'trigger-1',
        'dm-1',
        Action.SEE,
        'proj-1'
      );
      expect(result).toBe(false);
    });

    it('should allow MANAGE_TRIGGERS when user has DM maintenance (EDIT)', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: false,
        availableForMaintenance: true,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessDmTrigger(
        'user-1',
        ['editor'],
        'trigger-1',
        'dm-1',
        Action.MANAGE_TRIGGERS,
        'proj-1'
      );
      expect(result).toBe(true);
    });

    it('should deny MANAGE_TRIGGERS when user has only reporting access', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessDmTrigger(
        'user-1',
        ['editor'],
        'trigger-1',
        'dm-1',
        Action.MANAGE_TRIGGERS,
        'proj-1'
      );
      expect(result).toBe(false);
    });

    it('should allow admin full access to triggers', async () => {
      const m = createService();

      const result = await m.service.canAccessDmTrigger(
        'admin',
        ['admin'],
        'trigger-1',
        'dm-1',
        Action.MANAGE_TRIGGERS,
        'proj-1'
      );
      expect(result).toBe(true);
    });
  });

  describe('canAccessReport', () => {
    it('should deny SEE when parent DM is invisible', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: false,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessReport(
        'user-1',
        ['viewer'],
        'report-1',
        'dm-1',
        Action.SEE,
        'proj-1'
      );
      expect(result).toBe(false);
    });

    it('should allow SEE when parent DM is visible (shared for reporting)', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessReport(
        'user-1',
        ['viewer'],
        'report-1',
        'dm-1',
        Action.SEE,
        'proj-1'
      );
      expect(result).toBe(true);
    });

    it('should allow EDIT when user has DM maintenance access', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: false,
        availableForMaintenance: true,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessReport(
        'user-1',
        ['editor'],
        'report-1',
        'dm-1',
        Action.EDIT,
        'proj-1'
      );
      expect(result).toBe(true);
    });

    it('should deny EDIT when user has only reporting access and is not report owner', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);
      m.reportOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccessReport(
        'user-1',
        ['editor'],
        'report-1',
        'dm-1',
        Action.EDIT,
        'proj-1'
      );
      expect(result).toBe(false);
    });

    it('should allow EDIT when user is report owner with DM visibility', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);
      m.reportOwnerRepository.count.mockResolvedValue(1);

      const result = await m.service.canAccessReport(
        'user-1',
        ['viewer'],
        'report-1',
        'dm-1',
        Action.EDIT,
        'proj-1'
      );
      expect(result).toBe(true);
    });
  });
});
