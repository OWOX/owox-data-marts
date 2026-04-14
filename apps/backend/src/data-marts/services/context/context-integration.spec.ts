jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
  initializeTransactionalContext: jest.fn(),
}));

import { ForbiddenException } from '@nestjs/common';
import { AccessDecisionService } from '../access-decision/access-decision.service';
import { ContextAccessService } from './context-access.service';
import { ContextService } from './context.service';
import { ContextMapper } from '../../mappers/context.mapper';
import { EntityType, Action } from '../access-decision/access-decision.types';
import { RoleScope } from '../../enums/role-scope.enum';

// ─── Constants ───────────────────────────────────────────────────────────────
const PROJECT_ID = 'project-1';
const USER_ID = 'user-member';
const OWNER_ID = 'user-owner';
const DM_ID = 'dm-1';
const STORAGE_ID = 'storage-1';
const DEST_ID = 'dest-1';
const CTX_MARKETING = 'ctx-marketing';
const CTX_FINANCE = 'ctx-finance';
const CTX_PRODUCT = 'ctx-product';

// ─── Mock repository factory ────────────────────────────────────────────────
const createMockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softRemove: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
  upsert: jest.fn(),
});

// ─── Build entire service graph with mocked repos ───────────────────────────
function buildServices() {
  // Context-related repos
  const contextRepo = createMockRepository();
  const dmContextRepo = createMockRepository();
  const storageContextRepo = createMockRepository();
  const destContextRepo = createMockRepository();
  const memberRoleContextRepo = createMockRepository();
  const memberRoleScopeRepo = createMockRepository();

  // AccessDecision repos (entity + owner)
  const dataMartRepo = createMockRepository();
  const dataStorageRepo = createMockRepository();
  const dataDestRepo = createMockRepository();
  const dmTechOwnerRepo = createMockRepository();
  const dmBizOwnerRepo = createMockRepository();
  const storageOwnerRepo = createMockRepository();
  const destOwnerRepo = createMockRepository();
  const reportOwnerRepo = createMockRepository();
  const reportRepo = createMockRepository();

  const contextMapper = new ContextMapper();
  const userProjectionsFetcherService = {
    fetchRelevantUserProjections: jest.fn(),
    fetchUserProjectionsList: jest.fn(),
    fetchUserProjection: jest.fn(),
    fetchCreatedByUser: jest.fn(),
  };

  // Real ContextService
  const contextService = new ContextService(
    contextRepo as never,
    dmContextRepo as never,
    storageContextRepo as never,
    destContextRepo as never,
    memberRoleContextRepo as never,
    memberRoleScopeRepo as never,
    contextMapper,
    userProjectionsFetcherService as never
  );

  // Real ContextAccessService — needs accessDecisionService (circular).
  // We construct it with a placeholder, then replace.
  const contextAccessService = new ContextAccessService(
    dmContextRepo as never,
    storageContextRepo as never,
    destContextRepo as never,
    memberRoleScopeRepo as never,
    memberRoleContextRepo as never,
    contextService as never,
    /* accessDecisionService placeholder */ {} as never
  );

  // Real AccessDecisionService wired to real ContextAccessService
  const accessDecisionService = new AccessDecisionService(
    dataMartRepo as never,
    dataStorageRepo as never,
    dataDestRepo as never,
    dmTechOwnerRepo as never,
    dmBizOwnerRepo as never,
    storageOwnerRepo as never,
    destOwnerRepo as never,
    reportOwnerRepo as never,
    reportRepo as never,
    contextAccessService
  );

  // Close the circular dependency
  (contextAccessService as any).accessDecisionService = accessDecisionService;

  return {
    contextService,
    contextAccessService,
    accessDecisionService,
    // Repos — exposed for test-level stubbing
    contextRepo,
    dmContextRepo,
    storageContextRepo,
    destContextRepo,
    memberRoleContextRepo,
    memberRoleScopeRepo,
    dataMartRepo,
    dataStorageRepo,
    dataDestRepo,
    dmTechOwnerRepo,
    dmBizOwnerRepo,
    storageOwnerRepo,
    destOwnerRepo,
    reportOwnerRepo,
    reportRepo,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
/** Stub a shared DM (shared_for_both) that USER_ID does NOT own */
function stubSharedDmNonOwner(s: ReturnType<typeof buildServices>) {
  // non-owner
  s.dmTechOwnerRepo.count.mockResolvedValue(0);
  s.dmBizOwnerRepo.count.mockResolvedValue(0);
  // shared for both
  s.dataMartRepo.findOne.mockResolvedValue({
    id: DM_ID,
    availableForReporting: true,
    availableForMaintenance: true,
  });
}

/** Stub the query-builder chain used by hasContextOverlap */
function stubEntityContexts(repo: ReturnType<typeof createMockRepository>, matchingCount: number) {
  const qb = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(matchingCount),
  };
  repo.createQueryBuilder.mockReturnValue(qb);
  return qb;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ═══════════════════════════════════════════════════════════════════════════════
describe('Context Integration Tests', () => {
  let s: ReturnType<typeof buildServices>;

  beforeEach(() => {
    jest.clearAllMocks();
    s = buildServices();
  });

  // ─── Access control with contexts ──────────────────────────────────────────
  describe('Access control with contexts', () => {
    // 1. entire_project member sees all shared entities (Stage 3 unchanged)
    it('1. entire_project member sees all shared entities', async () => {
      stubSharedDmNonOwner(s);
      // role scope = entire_project
      s.memberRoleScopeRepo.findOne.mockResolvedValue(null); // lazy default

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
      // hasContextOverlap should NOT be called for entire_project
      expect(s.dmContextRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    // 2. selected_contexts [Marketing] member sees shared DM with [Marketing]
    it('2. selected_contexts [Marketing] member sees shared DM with [Marketing]', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      // member has [Marketing]
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_MARKETING },
      ]);
      // entity has [Marketing] → overlap count = 1
      stubEntityContexts(s.dmContextRepo, 1);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
    });

    // 3. selected_contexts [Marketing] member cannot see shared DM with [Finance]
    it('3. selected_contexts [Marketing] member cannot see shared DM with [Finance]', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_MARKETING },
      ]);
      // entity has [Finance] only → overlap count = 0
      stubEntityContexts(s.dmContextRepo, 0);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });

    // 4. selected_contexts [Marketing] member sees shared DM with [Marketing, Finance] (union)
    it('4. selected_contexts [Marketing] member sees shared DM with [Marketing, Finance]', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_MARKETING },
      ]);
      // entity has [Marketing, Finance] → overlap count = 1 (Marketing matches)
      stubEntityContexts(s.dmContextRepo, 1);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
    });

    // 5. Entity with no contexts → invisible for selected_contexts member
    it('5. Entity with no contexts is invisible for selected_contexts member', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_MARKETING },
      ]);
      // entity has no contexts → overlap count = 0
      stubEntityContexts(s.dmContextRepo, 0);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });

    // 6. Owner sees own entity regardless of contexts
    it('6. Owner sees own entity regardless of contexts', async () => {
      // tech owner
      s.dmTechOwnerRepo.count.mockResolvedValue(1);
      // shared for both
      s.dataMartRepo.findOne.mockResolvedValue({
        id: DM_ID,
        availableForReporting: true,
        availableForMaintenance: true,
      });

      const result = await s.accessDecisionService.canAccess(
        OWNER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
      // context gate should be skipped for owners
      expect(s.memberRoleScopeRepo.findOne).not.toHaveBeenCalled();
    });

    // 7. Admin sees everything regardless of contexts
    it('7. Admin sees everything regardless of contexts', async () => {
      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['admin'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
      // admin shortcut — no owner check, no context check
      expect(s.dmTechOwnerRepo.count).not.toHaveBeenCalled();
      expect(s.memberRoleScopeRepo.findOne).not.toHaveBeenCalled();
    });

    // 8. entire_project member sees entity without contexts
    it('8. entire_project member sees entity without contexts', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.ENTIRE_PROJECT,
      });

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
      // hasContextOverlap should NOT be called
      expect(s.dmContextRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── Role scope management ────────────────────────────────────────────────
  describe('Role scope management', () => {
    // 9. selected_contexts + 0 contexts → allowed (spec §Participation rules)
    it('9. selected_contexts with 0 contexts is allowed (valid "no shared access" state)', async () => {
      // Per stage-4 spec: a member with scope=selected_contexts and zero
      // contexts simply gets no shared non-owner access — this is NOT an
      // error state the backend should block.
      s.memberRoleContextRepo.count.mockResolvedValue(0);
      s.memberRoleScopeRepo.upsert.mockResolvedValue(undefined);

      await expect(
        s.contextAccessService.updateMemberRoleScope(
          USER_ID,
          PROJECT_ID,
          RoleScope.SELECTED_CONTEXTS
        )
      ).resolves.not.toThrow();
      expect(s.memberRoleScopeRepo.upsert).toHaveBeenCalledWith(
        { userId: USER_ID, projectId: PROJECT_ID, roleScope: RoleScope.SELECTED_CONTEXTS },
        ['userId', 'projectId']
      );
    });

    // 10. selected_contexts with contexts → allowed
    it('10. selected_contexts with contexts succeeds', async () => {
      s.memberRoleContextRepo.count.mockResolvedValue(2);
      s.memberRoleScopeRepo.upsert.mockResolvedValue(undefined);

      await expect(
        s.contextAccessService.updateMemberRoleScope(
          USER_ID,
          PROJECT_ID,
          RoleScope.SELECTED_CONTEXTS
        )
      ).resolves.not.toThrow();

      expect(s.memberRoleScopeRepo.upsert).toHaveBeenCalledWith(
        { userId: USER_ID, projectId: PROJECT_ID, roleScope: RoleScope.SELECTED_CONTEXTS },
        ['userId', 'projectId']
      );
    });

    // 11. Lazy default: no record → entire_project
    it('11. Lazy default: no scope record returns entire_project', async () => {
      s.memberRoleScopeRepo.findOne.mockResolvedValue(null);

      const scope = await s.contextAccessService.getRoleScope(USER_ID, PROJECT_ID);

      expect(scope).toBe(RoleScope.ENTIRE_PROJECT);
    });
  });

  // ─── Context assignment governance ─────────────────────────────────────────
  describe('Context assignment governance', () => {
    beforeEach(() => {
      // Default: context IDs are valid
      s.contextRepo.count.mockResolvedValue(2);
    });

    // 12. DM Tech Owner (TU = editor) can assign contexts
    it('12. DM Tech Owner with editor role can assign contexts', async () => {
      s.dmTechOwnerRepo.count.mockResolvedValue(1); // tech owner
      s.dmBizOwnerRepo.count.mockResolvedValue(0);
      s.dmContextRepo.delete.mockResolvedValue({ affected: 0 });
      s.dmContextRepo.save.mockResolvedValue([]);

      await expect(
        s.contextAccessService.updateDataMartContexts(
          DM_ID,
          PROJECT_ID,
          [CTX_MARKETING, CTX_FINANCE],
          OWNER_ID,
          ['editor']
        )
      ).resolves.not.toThrow();

      expect(s.dmContextRepo.delete).toHaveBeenCalledWith({ dataMartId: DM_ID });
      expect(s.dmContextRepo.save).toHaveBeenCalled();
    });

    // 13. DM Business Owner → ForbiddenException
    it('13. DM Business Owner cannot assign contexts', async () => {
      s.dmTechOwnerRepo.count.mockResolvedValue(0);
      s.dmBizOwnerRepo.count.mockResolvedValue(1); // biz owner

      await expect(
        s.contextAccessService.updateDataMartContexts(
          DM_ID,
          PROJECT_ID,
          [CTX_MARKETING],
          OWNER_ID,
          ['editor']
        )
      ).rejects.toThrow(ForbiddenException);
    });

    // 14. Non-owner with shared_for_maintenance → ForbiddenException
    it('14. Non-owner cannot assign contexts even if entity is shared', async () => {
      s.dmTechOwnerRepo.count.mockResolvedValue(0);
      s.dmBizOwnerRepo.count.mockResolvedValue(0);

      await expect(
        s.contextAccessService.updateDataMartContexts(DM_ID, PROJECT_ID, [CTX_MARKETING], USER_ID, [
          'editor',
        ])
      ).rejects.toThrow(ForbiddenException);
    });

    // 15. Storage Owner (TU = editor) can assign contexts
    it('15. Storage Owner with editor role can assign contexts', async () => {
      s.storageOwnerRepo.count.mockResolvedValue(1); // owner
      s.contextRepo.count.mockResolvedValue(1); // 1 context ID is valid
      s.storageContextRepo.delete.mockResolvedValue({ affected: 0 });
      s.storageContextRepo.save.mockResolvedValue([]);

      await expect(
        s.contextAccessService.updateStorageContexts(
          STORAGE_ID,
          PROJECT_ID,
          [CTX_MARKETING],
          OWNER_ID,
          ['editor']
        )
      ).resolves.not.toThrow();

      expect(s.storageContextRepo.delete).toHaveBeenCalledWith({ storageId: STORAGE_ID });
    });

    // 16. Destination Owner (any role) can assign contexts
    it('16. Destination Owner with viewer role can assign contexts', async () => {
      s.destOwnerRepo.count.mockResolvedValue(1); // owner
      s.contextRepo.count.mockResolvedValue(1); // 1 context ID is valid
      s.destContextRepo.delete.mockResolvedValue({ affected: 0 });
      s.destContextRepo.save.mockResolvedValue([]);

      await expect(
        s.contextAccessService.updateDestinationContexts(
          DEST_ID,
          PROJECT_ID,
          [CTX_FINANCE],
          OWNER_ID,
          ['viewer']
        )
      ).resolves.not.toThrow();

      expect(s.destContextRepo.delete).toHaveBeenCalledWith({ destinationId: DEST_ID });
    });

    // 17. Non-admin cannot create/delete context → controller-level (skipped)
  });

  // ─── Context overlap - union semantics ─────────────────────────────────────
  describe('Context overlap - union semantics', () => {
    // 18. Member [Marketing, Product] × Entity [Marketing, Finance] → overlap → ACCESS
    it('18. Member [Marketing, Product] × Entity [Marketing, Finance] → ACCESS', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_MARKETING },
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_PRODUCT },
      ]);
      // Entity has [Marketing, Finance] → Marketing overlaps → count 1
      stubEntityContexts(s.dmContextRepo, 1);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
    });

    // 19. Member [Product] × Entity [Marketing, Finance] → no overlap → DENY
    it('19. Member [Product] × Entity [Marketing, Finance] → DENY', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_PRODUCT },
      ]);
      // No overlap → count 0
      stubEntityContexts(s.dmContextRepo, 0);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });

    // 20. Member [Marketing] × Entity [] → DENY (entity has no contexts)
    it('20. Member [Marketing] × Entity [] → DENY', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_MARKETING },
      ]);
      // Entity has no contexts → overlap count = 0
      stubEntityContexts(s.dmContextRepo, 0);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });

    // 21. Member [] × Entity [Marketing] → DENY (member has no contexts)
    it('21. Member [] × Entity [Marketing] → DENY', async () => {
      stubSharedDmNonOwner(s);
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      // member has no contexts assigned
      s.memberRoleContextRepo.find.mockResolvedValue([]);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.DATA_MART,
        DM_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(false);
      // createQueryBuilder should NOT be called because hasContextOverlap short-circuits
      expect(s.dmContextRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ─── Detach-before-delete ─────────────────────────────────────────────────
  describe('Detach-before-delete', () => {
    const CONTEXT_ID = 'ctx-to-delete';

    const mockZeroCounts = () => {
      s.dmContextRepo.count.mockResolvedValue(0);
      s.storageContextRepo.count.mockResolvedValue(0);
      s.destContextRepo.count.mockResolvedValue(0);
      s.memberRoleContextRepo.count.mockResolvedValue(0);
    };

    // 22. Context delete throws ConflictException when still attached
    it('22. Context delete throws ConflictException when still attached to resources or members', async () => {
      s.contextRepo.findOne.mockResolvedValue({
        id: CONTEXT_ID,
        name: 'Doomed Context',
        projectId: PROJECT_ID,
      });
      s.dmContextRepo.count.mockResolvedValue(2);
      s.storageContextRepo.count.mockResolvedValue(1);
      s.destContextRepo.count.mockResolvedValue(3);
      s.memberRoleContextRepo.count.mockResolvedValue(4);

      await expect(s.contextService.delete(CONTEXT_ID, PROJECT_ID)).rejects.toMatchObject({
        response: {
          message: expect.stringContaining('Context is attached'),
          dataMartCount: 2,
          storageCount: 1,
          destinationCount: 3,
          memberCount: 4,
        },
      });

      expect(s.contextRepo.softRemove).not.toHaveBeenCalled();
      expect(s.dmContextRepo.delete).not.toHaveBeenCalled();
      expect(s.storageContextRepo.delete).not.toHaveBeenCalled();
      expect(s.destContextRepo.delete).not.toHaveBeenCalled();
      expect(s.memberRoleContextRepo.delete).not.toHaveBeenCalled();
    });

    // 23. Context delete soft-deletes when fully detached
    it('23. Context delete soft-deletes the context entity when no attachments', async () => {
      const entity = {
        id: CONTEXT_ID,
        name: 'Doomed Context',
        projectId: PROJECT_ID,
      };
      s.contextRepo.findOne.mockResolvedValue(entity);
      s.contextRepo.softRemove.mockResolvedValue({ ...entity, deletedAt: new Date() });
      mockZeroCounts();

      await s.contextService.delete(CONTEXT_ID, PROJECT_ID);

      expect(s.contextRepo.softRemove).toHaveBeenCalledWith(entity);
      expect(s.dmContextRepo.delete).not.toHaveBeenCalled();
      expect(s.memberRoleContextRepo.delete).not.toHaveBeenCalled();
    });

    // 24. Impact endpoint returns correct counts
    it('24. Impact endpoint returns correct counts', async () => {
      s.contextRepo.findOne.mockResolvedValue({
        id: CONTEXT_ID,
        name: 'Impact Context',
        projectId: PROJECT_ID,
      });
      s.dmContextRepo.count.mockResolvedValue(5);
      s.storageContextRepo.count.mockResolvedValue(3);
      s.destContextRepo.count.mockResolvedValue(2);
      s.memberRoleContextRepo.count.mockResolvedValue(7);
      s.memberRoleContextRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        andHaving: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([{ userId: 'affected-1' }, { userId: 'affected-2' }]),
      });

      const impact = await s.contextService.getImpact(CONTEXT_ID, PROJECT_ID);

      expect(impact.contextId).toBe(CONTEXT_ID);
      expect(impact.contextName).toBe('Impact Context');
      expect(impact.dataMartCount).toBe(5);
      expect(impact.storageCount).toBe(3);
      expect(impact.destinationCount).toBe(2);
      expect(impact.memberCount).toBe(7);
      expect(impact.affectedMemberIds).toEqual(['affected-1', 'affected-2']);
    });
  });

  // ─── Cross-entity type context gate ────────────────────────────────────────
  describe('Cross-entity type context gate', () => {
    it('Storage: selected_contexts member with overlap can see shared storage', async () => {
      // non-owner
      s.storageOwnerRepo.count.mockResolvedValue(0);
      // shared for both
      s.dataStorageRepo.findOne.mockResolvedValue({
        id: STORAGE_ID,
        availableForUse: true,
        availableForMaintenance: true,
      });
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_MARKETING },
      ]);
      stubEntityContexts(s.storageContextRepo, 1);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.STORAGE,
        STORAGE_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
    });

    it('Storage: selected_contexts member without overlap is denied', async () => {
      s.storageOwnerRepo.count.mockResolvedValue(0);
      s.dataStorageRepo.findOne.mockResolvedValue({
        id: STORAGE_ID,
        availableForUse: true,
        availableForMaintenance: true,
      });
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_PRODUCT },
      ]);
      stubEntityContexts(s.storageContextRepo, 0);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['editor'],
        EntityType.STORAGE,
        STORAGE_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });

    it('Destination: selected_contexts member with overlap can see shared destination', async () => {
      s.destOwnerRepo.count.mockResolvedValue(0);
      s.dataDestRepo.findOne.mockResolvedValue({
        id: DEST_ID,
        availableForUse: true,
        availableForMaintenance: true,
      });
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_FINANCE },
      ]);
      stubEntityContexts(s.destContextRepo, 1);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['viewer'],
        EntityType.DESTINATION,
        DEST_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(true);
    });

    it('Destination: selected_contexts member without overlap is denied', async () => {
      s.destOwnerRepo.count.mockResolvedValue(0);
      s.dataDestRepo.findOne.mockResolvedValue({
        id: DEST_ID,
        availableForUse: true,
        availableForMaintenance: true,
      });
      s.memberRoleScopeRepo.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      s.memberRoleContextRepo.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: CTX_PRODUCT },
      ]);
      stubEntityContexts(s.destContextRepo, 0);

      const result = await s.accessDecisionService.canAccess(
        USER_ID,
        ['viewer'],
        EntityType.DESTINATION,
        DEST_ID,
        Action.SEE,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });
  });
});
