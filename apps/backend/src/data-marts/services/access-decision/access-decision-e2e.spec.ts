jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { AccessDecisionService } from './access-decision.service';
import { ContextAccessService } from '../context/context-access.service';
import { RoleScope } from '../../enums/role-scope.enum';
import { EntityType, Action } from './access-decision.types';

/**
 * E2E-style tests validating full sharing flows from the spec.
 * These test realistic scenarios rather than individual matrix cells.
 */
describe('AccessDecisionService — E2E sharing flows', () => {
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
      dataStorageRepository,
      dataDestinationRepository,
      dataMartTechnicalOwnerRepository,
      dataMartBusinessOwnerRepository,
      storageOwnerRepository,
      destinationOwnerRepository,
      reportOwnerRepository,
      reportRepository,
      contextAccessService,
    };
  };

  describe('Scenario: Non-owner BU cannot see "Not shared" DataMart → 404', () => {
    it('should deny SEE for BU non-owner on not-shared DM', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: false,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccess(
        'bu-user',
        ['viewer'],
        EntityType.DATA_MART,
        'dm-1',
        Action.SEE,
        'proj-1'
      );
      expect(result).toBe(false);
    });
  });

  describe('Scenario: Non-owner TU CAN see "Shared for use" Storage → 200', () => {
    it('should allow SEE for TU non-owner on shared-for-use storage', async () => {
      const m = createService();
      m.dataStorageRepository.findOne.mockResolvedValue({
        id: 's-1',
        availableForUse: true,
        availableForMaintenance: false,
      });
      m.storageOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccess(
        'tu-user',
        ['editor'],
        EntityType.STORAGE,
        's-1',
        Action.SEE,
        'proj-1'
      );
      expect(result).toBe(true);
    });
  });

  describe('Scenario: Non-owner TU cannot edit "Shared for use" Storage → 403', () => {
    it('should deny EDIT for TU non-owner on shared-for-use storage', async () => {
      const m = createService();
      m.dataStorageRepository.findOne.mockResolvedValue({
        id: 's-1',
        availableForUse: true,
        availableForMaintenance: false,
      });
      m.storageOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccess(
        'tu-user',
        ['editor'],
        EntityType.STORAGE,
        's-1',
        Action.EDIT,
        'proj-1'
      );
      expect(result).toBe(false);
    });
  });

  describe('Scenario: Non-owner TU CAN edit "Shared for maintenance" Storage → 200', () => {
    it('should allow EDIT for TU non-owner on shared-for-maintenance storage', async () => {
      const m = createService();
      m.dataStorageRepository.findOne.mockResolvedValue({
        id: 's-1',
        availableForUse: false,
        availableForMaintenance: true,
      });
      m.storageOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccess(
        'tu-user',
        ['editor'],
        EntityType.STORAGE,
        's-1',
        Action.EDIT,
        'proj-1'
      );
      expect(result).toBe(true);
    });
  });

  describe('Scenario: BU Storage Owner → stored but no access (role mismatch)', () => {
    it('should deny all actions for BU owner of storage', async () => {
      const m = createService();
      m.dataStorageRepository.findOne.mockResolvedValue({
        id: 's-1',
        availableForUse: true,
        availableForMaintenance: true,
      });
      m.storageOwnerRepository.count.mockResolvedValue(1); // IS owner

      for (const action of [Action.SEE, Action.USE, Action.EDIT, Action.DELETE]) {
        const result = await m.service.canAccess(
          'bu-owner',
          ['viewer'],
          EntityType.STORAGE,
          's-1',
          action,
          'proj-1'
        );
        expect(result).toBe(false);
      }
    });
  });

  describe('Scenario: TU Tech Owner → full access regardless of sharing', () => {
    it('should allow all actions for TU tech owner even when not shared', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: false,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(1);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      for (const action of [
        Action.SEE,
        Action.USE,
        Action.EDIT,
        Action.DELETE,
        Action.CONFIGURE_SHARING,
        Action.MANAGE_OWNERS,
        Action.MANAGE_TRIGGERS,
      ]) {
        const result = await m.service.canAccess(
          'tu-tech-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          action,
          'proj-1'
        );
        expect(result).toBe(true);
      }
    });
  });

  describe('Scenario: Admin → full access regardless of sharing and ownership', () => {
    it('should allow all actions for admin on not-shared storage', async () => {
      const m = createService();

      for (const action of [
        Action.SEE,
        Action.USE,
        Action.COPY_CREDENTIALS,
        Action.EDIT,
        Action.DELETE,
        Action.CONFIGURE_SHARING,
        Action.MANAGE_OWNERS,
      ]) {
        const result = await m.service.canAccess(
          'admin-user',
          ['admin'],
          EntityType.STORAGE,
          's-1',
          action,
          'proj-1'
        );
        expect(result).toBe(true);
      }
    });
  });

  describe('Scenario: Copy credentials: non-owner on "Shared for use" → 403', () => {
    it('should deny COPY_CREDENTIALS on shared-for-use destination', async () => {
      const m = createService();
      m.dataDestinationRepository.findOne.mockResolvedValue({
        id: 'd-1',
        availableForUse: true,
        availableForMaintenance: false,
      });
      m.destinationOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccess(
        'tu-user',
        ['editor'],
        EntityType.DESTINATION,
        'd-1',
        Action.COPY_CREDENTIALS,
        'proj-1'
      );
      expect(result).toBe(false);
    });
  });

  describe('Scenario: Copy credentials: non-owner on "Shared for maintenance" → 200', () => {
    it('should allow COPY_CREDENTIALS on shared-for-maintenance destination', async () => {
      const m = createService();
      m.dataDestinationRepository.findOne.mockResolvedValue({
        id: 'd-1',
        availableForUse: false,
        availableForMaintenance: true,
      });
      m.destinationOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccess(
        'tu-user',
        ['editor'],
        EntityType.DESTINATION,
        'd-1',
        Action.COPY_CREDENTIALS,
        'proj-1'
      );
      expect(result).toBe(true);
    });
  });

  describe('Scenario: Non-owner BU + shared_for_reporting DM = SEE + USE only', () => {
    it('should allow SEE and USE but deny EDIT', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      expect(
        await m.service.canAccess('bu', ['viewer'], EntityType.DATA_MART, 'dm-1', Action.SEE, 'p')
      ).toBe(true);
      expect(
        await m.service.canAccess('bu', ['viewer'], EntityType.DATA_MART, 'dm-1', Action.USE, 'p')
      ).toBe(true);
      expect(
        await m.service.canAccess('bu', ['viewer'], EntityType.DATA_MART, 'dm-1', Action.EDIT, 'p')
      ).toBe(false);
      expect(
        await m.service.canAccess(
          'bu',
          ['viewer'],
          EntityType.DATA_MART,
          'dm-1',
          Action.DELETE,
          'p'
        )
      ).toBe(false);
    });
  });

  describe('Scenario: Owner management: non-owner editor → 403', () => {
    it('should deny MANAGE_OWNERS for non-owner editor', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: true,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(0);

      const result = await m.service.canAccess(
        'editor-user',
        ['editor'],
        EntityType.DATA_MART,
        'dm-1',
        Action.MANAGE_OWNERS,
        'proj-1'
      );
      expect(result).toBe(false);
    });
  });

  describe('Scenario: Biz Owner (TU) + Selected contexts (no overlap) + maintenance ON', () => {
    // Regression for the CTO review: ownership of the DM grants See/Use unconditionally,
    // but maintenance permissions come from the non-owner sharing path and must still
    // respect the context gate. A TU scoped to selected contexts with no overlap must
    // not gain EDIT just because they are also Business Owner.
    it('should deny EDIT and allow SEE for a TU Business Owner without context overlap', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: true,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(1);
      m.contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
      m.contextAccessService.hasContextOverlap.mockResolvedValue(false);

      // Ownership floor still grants See/Use regardless of context.
      expect(
        await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          Action.SEE,
          'proj-1'
        )
      ).toBe(true);

      // Maintenance permissions are denied because the non-owner sharing path is
      // gated by the context overlap, which fails.
      for (const action of [Action.EDIT, Action.DELETE, Action.MANAGE_TRIGGERS]) {
        const result = await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          action,
          'proj-1'
        );
        expect(result).toBe(false);
      }
    });

    it('should allow EDIT for a TU Business Owner with context overlap under Selected contexts', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: true,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(1);
      m.contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
      m.contextAccessService.hasContextOverlap.mockResolvedValue(true);

      expect(
        await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          Action.EDIT,
          'proj-1'
        )
      ).toBe(true);
    });
  });

  describe('Scenario: Biz Owner (TU role) + DM available for maintenance = full maintenance access', () => {
    it('should allow SEE, USE, EDIT, DELETE, MANAGE_TRIGGERS for a TU who is Business Owner of a DM available for maintenance', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: true,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(1);

      for (const action of [
        Action.SEE,
        Action.USE,
        Action.EDIT,
        Action.DELETE,
        Action.MANAGE_TRIGGERS,
      ]) {
        const result = await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          action,
          'proj-1'
        );
        expect(result).toBe(true);
      }

      expect(
        await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          Action.CONFIGURE_SHARING,
          'proj-1'
        )
      ).toBe(false);
      expect(
        await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          Action.MANAGE_OWNERS,
          'proj-1'
        )
      ).toBe(false);
    });

    it('should keep SEE+USE only for a TU Business Owner when the DM is not shared', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: false,
        availableForMaintenance: false,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(1);

      expect(
        await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          Action.SEE,
          'proj-1'
        )
      ).toBe(true);
      expect(
        await m.service.canAccess(
          'tu-biz-owner',
          ['editor'],
          EntityType.DATA_MART,
          'dm-1',
          Action.EDIT,
          'proj-1'
        )
      ).toBe(false);
    });

    it('should keep SEE+USE only for a Business User Business Owner regardless of sharing', async () => {
      const m = createService();
      m.dataMartRepository.findOne.mockResolvedValue({
        id: 'dm-1',
        availableForReporting: true,
        availableForMaintenance: true,
      });
      m.dataMartTechnicalOwnerRepository.count.mockResolvedValue(0);
      m.dataMartBusinessOwnerRepository.count.mockResolvedValue(1);

      expect(
        await m.service.canAccess(
          'bu-biz-owner',
          ['viewer'],
          EntityType.DATA_MART,
          'dm-1',
          Action.SEE,
          'proj-1'
        )
      ).toBe(true);
      expect(
        await m.service.canAccess(
          'bu-biz-owner',
          ['viewer'],
          EntityType.DATA_MART,
          'dm-1',
          Action.EDIT,
          'proj-1'
        )
      ).toBe(false);
    });
  });

  describe('Scenario: Destination non-owner BU + shared_for_maintenance = full maintenance', () => {
    it('should allow SEE, USE, COPY_CREDENTIALS, EDIT, DELETE for BU on shared-for-maintenance destination', async () => {
      const m = createService();
      m.dataDestinationRepository.findOne.mockResolvedValue({
        id: 'd-1',
        availableForUse: false,
        availableForMaintenance: true,
      });
      m.destinationOwnerRepository.count.mockResolvedValue(0);

      for (const action of [
        Action.SEE,
        Action.USE,
        Action.COPY_CREDENTIALS,
        Action.EDIT,
        Action.DELETE,
      ]) {
        const result = await m.service.canAccess(
          'bu-user',
          ['viewer'],
          EntityType.DESTINATION,
          'd-1',
          action,
          'proj-1'
        );
        expect(result).toBe(true);
      }

      // But not CONFIGURE_SHARING or MANAGE_OWNERS
      expect(
        await m.service.canAccess(
          'bu-user',
          ['viewer'],
          EntityType.DESTINATION,
          'd-1',
          Action.CONFIGURE_SHARING,
          'proj-1'
        )
      ).toBe(false);
      expect(
        await m.service.canAccess(
          'bu-user',
          ['viewer'],
          EntityType.DESTINATION,
          'd-1',
          Action.MANAGE_OWNERS,
          'proj-1'
        )
      ).toBe(false);
    });
  });
});
