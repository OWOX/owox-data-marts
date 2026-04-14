jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { AccessDecisionService } from './access-decision.service';
import { ContextAccessService } from '../context/context-access.service';
import { RoleScope } from '../../enums/role-scope.enum';
import { EntityType, Action, OwnerStatus, SharingState } from './access-decision.types';

describe('AccessDecisionService – Context Gate (Stage 4)', () => {
  let service: AccessDecisionService;
  let contextAccessService: {
    getRoleScope: jest.Mock;
    hasContextOverlap: jest.Mock;
  };

  // Spy references for internal methods
  let getOwnerStatusSpy: jest.SpyInstance;
  let getSharingStateSpy: jest.SpyInstance;
  let lookupMatrixSpy: jest.SpyInstance;

  const USER_ID = 'user-1';
  const ENTITY_ID = 'dm-1';
  const PROJECT_ID = 'proj-1';

  /**
   * Helper: create the service with mocked repositories and a mocked ContextAccessService,
   * then attach spies on internal methods so we can control ownerStatus / sharingState / matrix
   * without going through real repository calls.
   */
  function setup() {
    // Minimal repository stubs (never actually called – we spy over the methods)
    const repo = () => ({ findOne: jest.fn(), count: jest.fn() });

    contextAccessService = {
      getRoleScope: jest.fn(),
      hasContextOverlap: jest.fn(),
    };

    service = new AccessDecisionService(
      repo() as never, // dataMartRepository
      repo() as never, // dataStorageRepository
      repo() as never, // dataDestinationRepository
      repo() as never, // dataMartTechnicalOwnerRepository
      repo() as never, // dataMartBusinessOwnerRepository
      repo() as never, // storageOwnerRepository
      repo() as never, // destinationOwnerRepository
      repo() as never, // reportOwnerRepository
      repo() as never, // reportRepository
      contextAccessService as unknown as ContextAccessService
    );

    // Spy over the three internal helpers so tests can control them directly
    getOwnerStatusSpy = jest
      .spyOn(service as any, 'getOwnerStatus')
      .mockResolvedValue(OwnerStatus.NON_OWNER);

    getSharingStateSpy = jest
      .spyOn(service as any, 'getSharingState')
      .mockResolvedValue(SharingState.SHARED_FOR_BOTH);

    lookupMatrixSpy = jest.spyOn(service as any, 'lookupMatrix').mockReturnValue(true);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    setup();
  });

  // ─── 1. Admin → allow, no context check ───────────────────────────────
  it('1. Admin → allow (no context check at all)', async () => {
    lookupMatrixSpy.mockReturnValue(true);

    const result = await service.canAccess(
      USER_ID,
      ['admin'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(true);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(contextAccessService.hasContextOverlap).not.toHaveBeenCalled();
  });

  // ─── 2. Owner (tech_owner) → allow regardless of contexts ─────────────
  it('2. Owner (tech_owner) → allow regardless of contexts', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.TECH_OWNER);
    getSharingStateSpy.mockResolvedValue(SharingState.SHARED_FOR_BOTH);
    lookupMatrixSpy.mockReturnValue(true);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.EDIT,
      PROJECT_ID
    );

    expect(result).toBe(true);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
  });

  // ─── 3. Owner (biz_owner) → allow regardless of contexts ──────────────
  it('3. Owner (biz_owner) → allow regardless of contexts', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.BIZ_OWNER);
    getSharingStateSpy.mockResolvedValue(SharingState.SHARED_FOR_BOTH);
    lookupMatrixSpy.mockReturnValue(true);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(true);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
  });

  // ─── 4. Non-owner, matrix allows, entire_project → allow ──────────────
  it('4. Non-owner, matrix allows, entire_project → allow (hasContextOverlap NOT called)', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    lookupMatrixSpy.mockReturnValue(true);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(true);
    expect(contextAccessService.getRoleScope).toHaveBeenCalledWith(USER_ID, PROJECT_ID);
    expect(contextAccessService.hasContextOverlap).not.toHaveBeenCalled();
  });

  // ─── 5. Non-owner, matrix allows, selected_contexts, has overlap → allow
  it('5. Non-owner, matrix allows, selected_contexts, has overlap → allow', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    lookupMatrixSpy.mockReturnValue(true);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    contextAccessService.hasContextOverlap.mockResolvedValue(true);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(true);
    expect(contextAccessService.hasContextOverlap).toHaveBeenCalledWith(
      USER_ID,
      EntityType.DATA_MART,
      ENTITY_ID,
      PROJECT_ID
    );
  });

  // ─── 6. Non-owner, matrix allows, selected_contexts, no overlap → DENY
  it('6. Non-owner, matrix allows, selected_contexts, no overlap → DENY', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    lookupMatrixSpy.mockReturnValue(true);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    contextAccessService.hasContextOverlap.mockResolvedValue(false);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(false);
  });

  // ─── 7. Non-owner, matrix denies → deny (context gate NOT reached) ────
  it('7. Non-owner, matrix denies → deny (context gate NOT reached)', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    lookupMatrixSpy.mockReturnValue(false);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.EDIT,
      PROJECT_ID
    );

    expect(result).toBe(false);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(contextAccessService.hasContextOverlap).not.toHaveBeenCalled();
  });

  // ─── 8. Non-owner, selected_contexts, entity has no contexts → DENY ───
  it('8. Non-owner, selected_contexts, entity has no contexts → DENY (overlap returns false)', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    lookupMatrixSpy.mockReturnValue(true);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    // hasContextOverlap returns false when entity has no contexts assigned
    contextAccessService.hasContextOverlap.mockResolvedValue(false);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.STORAGE,
      'storage-1',
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(false);
  });

  // ─── 9. Non-owner, selected_contexts, member has no contexts → DENY ───
  it('9. Non-owner, selected_contexts, member has no contexts → DENY (overlap returns false)', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    lookupMatrixSpy.mockReturnValue(true);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    // hasContextOverlap returns false when member has no contexts assigned
    contextAccessService.hasContextOverlap.mockResolvedValue(false);

    const result = await service.canAccess(
      USER_ID,
      ['viewer'],
      EntityType.DESTINATION,
      'dest-1',
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(false);
  });

  // ─── 10. canAccessReport: context gate applies when checking DM for report
  it('10. canAccessReport: context gate applies for DM visibility check', async () => {
    const REPORT_ID = 'report-1';
    const DM_ID = 'dm-1';

    // canAccess will be called for DM SEE check — we spy on canAccess itself
    // but we need to restore and re-spy properly.
    // Instead, let the internal helpers drive behaviour.
    // For SEE on DM: non-owner, matrix allows, selected_contexts, no overlap → deny
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    getSharingStateSpy.mockResolvedValue(SharingState.SHARED_FOR_BOTH);
    lookupMatrixSpy.mockReturnValue(true);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    contextAccessService.hasContextOverlap.mockResolvedValue(false);

    const result = await service.canAccessReport(
      USER_ID,
      ['editor'],
      REPORT_ID,
      DM_ID,
      Action.SEE,
      PROJECT_ID
    );

    // canAccessReport calls canAccess(DM, SEE) which should be denied by context gate
    expect(result).toBe(false);
  });

  // ─── 11. canAccessDmTrigger: context gate applies when checking DM for trigger
  it('11. canAccessDmTrigger: context gate applies for DM check', async () => {
    const TRIGGER_ID = 'trigger-1';
    const DM_ID = 'dm-1';

    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    getSharingStateSpy.mockResolvedValue(SharingState.SHARED_FOR_BOTH);
    lookupMatrixSpy.mockReturnValue(true);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    contextAccessService.hasContextOverlap.mockResolvedValue(false);

    const result = await service.canAccessDmTrigger(
      USER_ID,
      ['editor'],
      TRIGGER_ID,
      DM_ID,
      Action.SEE,
      PROJECT_ID
    );

    expect(result).toBe(false);
  });

  // ─── 12. projectId not provided → skip context check (backward compat) ─
  it('12. projectId not provided → skip context check (backward compatibility)', async () => {
    getOwnerStatusSpy.mockResolvedValue(OwnerStatus.NON_OWNER);
    lookupMatrixSpy.mockReturnValue(true);

    const result = await service.canAccess(
      USER_ID,
      ['editor'],
      EntityType.DATA_MART,
      ENTITY_ID,
      Action.SEE
      // no projectId
    );

    expect(result).toBe(true);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(contextAccessService.hasContextOverlap).not.toHaveBeenCalled();
  });
});
