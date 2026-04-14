jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { AccessDecisionService } from './access-decision.service';
import { ACCESS_MATRIX } from './access-matrix.config';
import { EntityType, OwnerStatus, SharingState } from './access-decision.types';
import { ContextAccessService } from '../context/context-access.service';
import { RoleScope } from '../../enums/role-scope.enum';

describe('AccessDecisionService', () => {
  const createService = () => {
    const dataMartRepository = {
      findOne: jest.fn(),
    };
    const dataStorageRepository = {
      findOne: jest.fn(),
    };
    const dataDestinationRepository = {
      findOne: jest.fn(),
    };
    const dataMartTechnicalOwnerRepository = {
      count: jest.fn(),
    };
    const dataMartBusinessOwnerRepository = {
      count: jest.fn(),
    };
    const storageOwnerRepository = {
      count: jest.fn(),
    };
    const destinationOwnerRepository = {
      count: jest.fn(),
    };
    const reportOwnerRepository = {
      count: jest.fn(),
    };
    const reportRepository = {
      findOne: jest.fn(),
    };

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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Configure mocks so that getOwnerStatus and getSharingState return expected values.
   */
  function configureMocks(
    mocks: ReturnType<typeof createService>,
    entityType: EntityType,
    ownerStatus: OwnerStatus,
    sharingState: SharingState
  ) {
    const userId = 'user-1';
    const entityId = 'entity-1';

    // Configure sharing state on entity
    const sharingFields = resolveSharingFields(entityType, sharingState);

    switch (entityType) {
      case EntityType.STORAGE:
        mocks.dataStorageRepository.findOne.mockResolvedValue({
          id: entityId,
          ...sharingFields,
        });
        configureStorageOwnership(mocks, ownerStatus, userId, entityId);
        break;
      case EntityType.DATA_MART:
        mocks.dataMartRepository.findOne.mockResolvedValue({
          id: entityId,
          ...sharingFields,
        });
        configureDmOwnership(mocks, ownerStatus, userId, entityId);
        break;
      case EntityType.DESTINATION:
        mocks.dataDestinationRepository.findOne.mockResolvedValue({
          id: entityId,
          ...sharingFields,
        });
        configureDestOwnership(mocks, ownerStatus, userId, entityId);
        break;
    }
  }

  function resolveSharingFields(
    entityType: EntityType,
    sharingState: SharingState
  ): Record<string, boolean> {
    if (entityType === EntityType.DATA_MART) {
      switch (sharingState) {
        case SharingState.NOT_SHARED:
          return { availableForReporting: false, availableForMaintenance: false };
        case SharingState.SHARED_FOR_REPORTING:
          return { availableForReporting: true, availableForMaintenance: false };
        case SharingState.SHARED_FOR_MAINTENANCE:
          return { availableForReporting: false, availableForMaintenance: true };
        case SharingState.SHARED_FOR_BOTH:
          return { availableForReporting: true, availableForMaintenance: true };
        case SharingState.SHARED_FOR_USE:
          return { availableForReporting: true, availableForMaintenance: false };
      }
    }
    // Storage & Destination
    switch (sharingState) {
      case SharingState.NOT_SHARED:
        return { availableForUse: false, availableForMaintenance: false };
      case SharingState.SHARED_FOR_USE:
        return { availableForUse: true, availableForMaintenance: false };
      case SharingState.SHARED_FOR_MAINTENANCE:
        return { availableForUse: false, availableForMaintenance: true };
      case SharingState.SHARED_FOR_BOTH:
        return { availableForUse: true, availableForMaintenance: true };
      case SharingState.SHARED_FOR_REPORTING:
        return { availableForUse: true, availableForMaintenance: false };
    }
  }

  function configureStorageOwnership(
    mocks: ReturnType<typeof createService>,
    ownerStatus: OwnerStatus,
    _userId: string,
    _entityId: string
  ) {
    const isOwner = ownerStatus === OwnerStatus.OWNER || ownerStatus === OwnerStatus.ADMIN;
    mocks.storageOwnerRepository.count.mockResolvedValue(isOwner ? 1 : 0);
  }

  function configureDmOwnership(
    mocks: ReturnType<typeof createService>,
    ownerStatus: OwnerStatus,
    _userId: string,
    _entityId: string
  ) {
    const isTechOwner = ownerStatus === OwnerStatus.TECH_OWNER || ownerStatus === OwnerStatus.ADMIN;
    const isBizOwner = ownerStatus === OwnerStatus.BIZ_OWNER;
    mocks.dataMartTechnicalOwnerRepository.count.mockResolvedValue(isTechOwner ? 1 : 0);
    mocks.dataMartBusinessOwnerRepository.count.mockResolvedValue(isBizOwner ? 1 : 0);
  }

  function configureDestOwnership(
    mocks: ReturnType<typeof createService>,
    ownerStatus: OwnerStatus,
    _userId: string,
    _entityId: string
  ) {
    const isOwner = ownerStatus === OwnerStatus.OWNER || ownerStatus === OwnerStatus.ADMIN;
    mocks.destinationOwnerRepository.count.mockResolvedValue(isOwner ? 1 : 0);
  }

  // Filter matrix to Storage, DataMart, Destination (not DM_TRIGGER, REPORT, REPORT_TRIGGER — those are tested separately)
  const directEntityRules = ACCESS_MATRIX.filter(
    r =>
      r.entityType === EntityType.STORAGE ||
      r.entityType === EntityType.DATA_MART ||
      r.entityType === EntityType.DESTINATION
  );

  // Build test cases
  const testCases = directEntityRules.map(rule => ({
    name: `${rule.entityType} | ${rule.role} | ${rule.ownershipStatus} | ${rule.sharingState} | ${rule.action} → ${rule.result ? 'ALLOW' : 'DENY'}`,
    rule,
  }));

  it(`should have ${testCases.length} parametrized test cases (expect 200+)`, () => {
    expect(testCases.length).toBeGreaterThanOrEqual(200);
  });

  it.each(testCases)('$name', async ({ rule }) => {
    const mocks = createService();

    configureMocks(mocks, rule.entityType, rule.ownershipStatus, rule.sharingState);

    const result = await mocks.service.canAccess(
      'user-1',
      [rule.role],
      rule.entityType,
      'entity-1',
      rule.action,
      'proj-1'
    );

    expect(result).toBe(rule.result);
  });
});
