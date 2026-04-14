import { ForbiddenException } from '@nestjs/common';
import { OwnerStatus, EntityType } from '../access-decision/access-decision.types';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from './context-access.service';

jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
  initializeTransactionalContext: jest.fn(),
}));

describe('ContextAccessService', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';
  const TARGET_USER_ID = 'user-2';
  const DATA_MART_ID = 'dm-1';
  const STORAGE_ID = 'storage-1';
  const DESTINATION_ID = 'dest-1';
  const CONTEXT_IDS = ['ctx-1', 'ctx-2'];

  const createMockRepository = () => ({
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn(),
    upsert: jest.fn(),
  });

  const createService = () => {
    const dataMartContextRepository = createMockRepository();
    const storageContextRepository = createMockRepository();
    const destinationContextRepository = createMockRepository();
    const memberRoleScopeRepository = createMockRepository();
    const memberRoleContextRepository = createMockRepository();

    const contextService = {
      validateContextIds: jest.fn(),
    };

    const accessDecisionService = {
      getOwnerStatus: jest.fn(),
    };

    const service = new ContextAccessService(
      dataMartContextRepository as never,
      storageContextRepository as never,
      destinationContextRepository as never,
      memberRoleScopeRepository as never,
      memberRoleContextRepository as never,
      contextService as never,
      accessDecisionService as never
    );

    return {
      service,
      dataMartContextRepository,
      storageContextRepository,
      destinationContextRepository,
      memberRoleScopeRepository,
      memberRoleContextRepository,
      contextService,
      accessDecisionService,
    };
  };

  describe('updateDataMartContexts', () => {
    it('should allow admin to assign contexts', async () => {
      const { service, accessDecisionService, contextService, dataMartContextRepository } =
        createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.NON_OWNER);
      contextService.validateContextIds.mockResolvedValue(undefined);
      dataMartContextRepository.delete.mockResolvedValue({ affected: 0 });
      dataMartContextRepository.save.mockResolvedValue([]);

      await expect(
        service.updateDataMartContexts(DATA_MART_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, ['admin'])
      ).resolves.not.toThrow();

      expect(contextService.validateContextIds).toHaveBeenCalledWith(CONTEXT_IDS, PROJECT_ID);
      expect(dataMartContextRepository.delete).toHaveBeenCalledWith({ dataMartId: DATA_MART_ID });
      expect(dataMartContextRepository.save).toHaveBeenCalled();
    });

    it('should allow tech owner with editor role to assign contexts', async () => {
      const { service, accessDecisionService, contextService, dataMartContextRepository } =
        createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.TECH_OWNER);
      contextService.validateContextIds.mockResolvedValue(undefined);
      dataMartContextRepository.delete.mockResolvedValue({ affected: 0 });
      dataMartContextRepository.save.mockResolvedValue([]);

      await expect(
        service.updateDataMartContexts(DATA_MART_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, ['editor'])
      ).resolves.not.toThrow();

      expect(dataMartContextRepository.delete).toHaveBeenCalledWith({ dataMartId: DATA_MART_ID });
    });

    it('should reject business owner', async () => {
      const { service, accessDecisionService } = createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.BIZ_OWNER);

      await expect(
        service.updateDataMartContexts(DATA_MART_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, ['editor'])
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject non-owner', async () => {
      const { service, accessDecisionService } = createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.NON_OWNER);

      await expect(
        service.updateDataMartContexts(DATA_MART_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, ['editor'])
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject tech owner with viewer role (BU)', async () => {
      const { service, accessDecisionService } = createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.TECH_OWNER);

      await expect(
        service.updateDataMartContexts(DATA_MART_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, ['viewer'])
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStorageContexts', () => {
    it('should allow owner with editor role to assign contexts', async () => {
      const { service, accessDecisionService, contextService, storageContextRepository } =
        createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.OWNER);
      contextService.validateContextIds.mockResolvedValue(undefined);
      storageContextRepository.delete.mockResolvedValue({ affected: 0 });
      storageContextRepository.save.mockResolvedValue([]);

      await expect(
        service.updateStorageContexts(STORAGE_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, ['editor'])
      ).resolves.not.toThrow();

      expect(accessDecisionService.getOwnerStatus).toHaveBeenCalledWith(
        USER_ID,
        EntityType.STORAGE,
        STORAGE_ID
      );
      expect(storageContextRepository.delete).toHaveBeenCalledWith({ storageId: STORAGE_ID });
    });

    it('should reject non-owner', async () => {
      const { service, accessDecisionService } = createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.NON_OWNER);

      await expect(
        service.updateStorageContexts(STORAGE_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, ['editor'])
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateDestinationContexts', () => {
    it('should allow owner with any role to assign contexts', async () => {
      const { service, accessDecisionService, contextService, destinationContextRepository } =
        createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.OWNER);
      contextService.validateContextIds.mockResolvedValue(undefined);
      destinationContextRepository.delete.mockResolvedValue({ affected: 0 });
      destinationContextRepository.save.mockResolvedValue([]);

      await expect(
        service.updateDestinationContexts(DESTINATION_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, [
          'viewer',
        ])
      ).resolves.not.toThrow();

      expect(accessDecisionService.getOwnerStatus).toHaveBeenCalledWith(
        USER_ID,
        EntityType.DESTINATION,
        DESTINATION_ID
      );
      expect(destinationContextRepository.delete).toHaveBeenCalledWith({
        destinationId: DESTINATION_ID,
      });
    });

    it('should reject non-owner', async () => {
      const { service, accessDecisionService } = createService();

      accessDecisionService.getOwnerStatus.mockResolvedValue(OwnerStatus.NON_OWNER);

      await expect(
        service.updateDestinationContexts(DESTINATION_ID, PROJECT_ID, CONTEXT_IDS, USER_ID, [
          'viewer',
        ])
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getRoleScope', () => {
    it('should return ENTIRE_PROJECT when no record found (lazy default)', async () => {
      const { service, memberRoleScopeRepository } = createService();

      memberRoleScopeRepository.findOne.mockResolvedValue(null);

      const result = await service.getRoleScope(USER_ID, PROJECT_ID);

      expect(result).toBe(RoleScope.ENTIRE_PROJECT);
    });

    it('should return stored value when record exists', async () => {
      const { service, memberRoleScopeRepository } = createService();

      memberRoleScopeRepository.findOne.mockResolvedValue({
        userId: USER_ID,
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });

      const result = await service.getRoleScope(USER_ID, PROJECT_ID);

      expect(result).toBe(RoleScope.SELECTED_CONTEXTS);
    });
  });

  describe('updateMemberRoleScope', () => {
    it('allows selected_contexts even when member has zero contexts (spec §Participation)', async () => {
      // Per stage-4 spec, a member with scope=selected_contexts and zero
      // contexts is a valid "no shared access" state. The service must not
      // block this transition.
      const { service, memberRoleContextRepository, memberRoleScopeRepository } = createService();

      memberRoleContextRepository.count.mockResolvedValue(0);
      memberRoleScopeRepository.upsert.mockResolvedValue(undefined);

      await expect(
        service.updateMemberRoleScope(TARGET_USER_ID, PROJECT_ID, RoleScope.SELECTED_CONTEXTS)
      ).resolves.not.toThrow();

      expect(memberRoleScopeRepository.upsert).toHaveBeenCalledWith(
        { userId: TARGET_USER_ID, projectId: PROJECT_ID, roleScope: RoleScope.SELECTED_CONTEXTS },
        ['userId', 'projectId']
      );
    });

    it('should allow selected_contexts when member has contexts', async () => {
      const { service, memberRoleContextRepository, memberRoleScopeRepository } = createService();

      memberRoleContextRepository.count.mockResolvedValue(2);
      memberRoleScopeRepository.upsert.mockResolvedValue(undefined);

      await expect(
        service.updateMemberRoleScope(TARGET_USER_ID, PROJECT_ID, RoleScope.SELECTED_CONTEXTS)
      ).resolves.not.toThrow();

      expect(memberRoleScopeRepository.upsert).toHaveBeenCalledWith(
        { userId: TARGET_USER_ID, projectId: PROJECT_ID, roleScope: RoleScope.SELECTED_CONTEXTS },
        ['userId', 'projectId']
      );
    });
  });

  describe('getMemberContextIds', () => {
    it('returns context ids from repository records', async () => {
      const { service, memberRoleContextRepository } = createService();

      memberRoleContextRepository.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-a' },
        { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-b' },
      ]);

      const result = await service.getMemberContextIds(USER_ID, PROJECT_ID);

      expect(result).toEqual(['ctx-a', 'ctx-b']);
      expect(memberRoleContextRepository.find).toHaveBeenCalledWith({
        where: { userId: USER_ID, projectId: PROJECT_ID },
      });
    });

    it('returns empty array when member has no contexts', async () => {
      const { service, memberRoleContextRepository } = createService();
      memberRoleContextRepository.find.mockResolvedValue([]);

      const result = await service.getMemberContextIds(USER_ID, PROJECT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('updateMember', () => {
    it('forces entire_project scope and clears contexts when role is admin', async () => {
      const { service, memberRoleContextRepository, memberRoleScopeRepository, contextService } =
        createService();
      contextService.validateContextIds.mockResolvedValue(undefined);
      memberRoleContextRepository.delete.mockResolvedValue({ affected: 0 });
      memberRoleContextRepository.save.mockResolvedValue([]);
      memberRoleContextRepository.count.mockResolvedValue(0);
      memberRoleScopeRepository.upsert.mockResolvedValue(undefined);

      await service.updateMember(TARGET_USER_ID, PROJECT_ID, {
        role: 'admin',
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1', 'ctx-2'],
      });

      expect(contextService.validateContextIds).toHaveBeenCalledWith([], PROJECT_ID);
      expect(memberRoleScopeRepository.upsert).toHaveBeenCalledWith(
        {
          userId: TARGET_USER_ID,
          projectId: PROJECT_ID,
          roleScope: RoleScope.ENTIRE_PROJECT,
        },
        ['userId', 'projectId']
      );
    });

    it('persists requested scope + contexts for non-admin roles', async () => {
      const { service, contextService, memberRoleContextRepository, memberRoleScopeRepository } =
        createService();
      contextService.validateContextIds.mockResolvedValue(undefined);
      memberRoleContextRepository.delete.mockResolvedValue({ affected: 0 });
      memberRoleContextRepository.save.mockResolvedValue([]);
      memberRoleContextRepository.count.mockResolvedValue(1);
      memberRoleScopeRepository.upsert.mockResolvedValue(undefined);

      await service.updateMember(TARGET_USER_ID, PROJECT_ID, {
        role: 'editor',
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
      });

      expect(contextService.validateContextIds).toHaveBeenCalledWith(['ctx-1'], PROJECT_ID);
      expect(memberRoleScopeRepository.upsert).toHaveBeenCalledWith(
        {
          userId: TARGET_USER_ID,
          projectId: PROJECT_ID,
          roleScope: RoleScope.SELECTED_CONTEXTS,
        },
        ['userId', 'projectId']
      );
    });
  });

  describe('removeMemberBindings', () => {
    it('deletes member_role_contexts and member_role_scope for the user', async () => {
      const { service, memberRoleContextRepository, memberRoleScopeRepository } = createService();
      memberRoleContextRepository.delete.mockResolvedValue({ affected: 2 });
      memberRoleScopeRepository.delete.mockResolvedValue({ affected: 1 });

      await service.removeMemberBindings(TARGET_USER_ID, PROJECT_ID);

      expect(memberRoleContextRepository.delete).toHaveBeenCalledWith({
        userId: TARGET_USER_ID,
        projectId: PROJECT_ID,
      });
      expect(memberRoleScopeRepository.delete).toHaveBeenCalledWith({
        userId: TARGET_USER_ID,
        projectId: PROJECT_ID,
      });
    });

    it('is idempotent when the user has no bindings', async () => {
      const { service, memberRoleContextRepository, memberRoleScopeRepository } = createService();
      memberRoleContextRepository.delete.mockResolvedValue({ affected: 0 });
      memberRoleScopeRepository.delete.mockResolvedValue({ affected: 0 });

      await expect(
        service.removeMemberBindings(TARGET_USER_ID, PROJECT_ID)
      ).resolves.toBeUndefined();
    });
  });

  describe('setContextMembers', () => {
    const CONTEXT_ID = 'ctx-1';

    it('inserts only new bindings, deletes only removed bindings', async () => {
      const { service, contextService, memberRoleContextRepository } = createService();
      contextService.validateContextIds.mockResolvedValue(undefined);
      // Current: users 'u1', 'u2'
      memberRoleContextRepository.find.mockResolvedValue([
        { userId: 'u1', projectId: PROJECT_ID, contextId: CONTEXT_ID },
        { userId: 'u2', projectId: PROJECT_ID, contextId: CONTEXT_ID },
      ]);
      // After remove, re-count per-user remaining contexts: both still have other ctx
      memberRoleContextRepository.count.mockResolvedValue(1);
      memberRoleContextRepository.save.mockResolvedValue([]);
      memberRoleContextRepository.delete.mockResolvedValue({ affected: 1 });

      // Requested: users 'u1', 'u3' → add 'u3', remove 'u2'
      await service.setContextMembers(CONTEXT_ID, PROJECT_ID, ['u1', 'u3']);

      expect(contextService.validateContextIds).toHaveBeenCalledWith([CONTEXT_ID], PROJECT_ID);
      expect(memberRoleContextRepository.save).toHaveBeenCalledWith([
        { userId: 'u3', projectId: PROJECT_ID, contextId: CONTEXT_ID },
      ]);
      expect(memberRoleContextRepository.delete).toHaveBeenCalledWith([
        { userId: 'u2', projectId: PROJECT_ID, contextId: CONTEXT_ID },
      ]);
    });

    it('never touches member_role_scope, even when last binding is removed', async () => {
      // Per spec (stage 4, §"Participation rules"): scope=selected_contexts
      // with zero contexts is a valid state — the member simply gets no shared
      // non-owner access. We must not silently upgrade their scope.
      const { service, contextService, memberRoleContextRepository, memberRoleScopeRepository } =
        createService();
      contextService.validateContextIds.mockResolvedValue(undefined);
      memberRoleContextRepository.find.mockResolvedValue([
        { userId: 'u1', projectId: PROJECT_ID, contextId: CONTEXT_ID },
      ]);
      memberRoleContextRepository.delete.mockResolvedValue({ affected: 1 });

      await service.setContextMembers(CONTEXT_ID, PROJECT_ID, []);

      expect(memberRoleScopeRepository.findOne).not.toHaveBeenCalled();
      expect(memberRoleScopeRepository.upsert).not.toHaveBeenCalled();
      expect(memberRoleScopeRepository.delete).not.toHaveBeenCalled();
    });

    it('is a no-op when requested set matches current set', async () => {
      const { service, contextService, memberRoleContextRepository } = createService();
      contextService.validateContextIds.mockResolvedValue(undefined);
      memberRoleContextRepository.find.mockResolvedValue([
        { userId: 'u1', projectId: PROJECT_ID, contextId: CONTEXT_ID },
      ]);

      await service.setContextMembers(CONTEXT_ID, PROJECT_ID, ['u1']);

      expect(memberRoleContextRepository.save).not.toHaveBeenCalled();
      expect(memberRoleContextRepository.delete).not.toHaveBeenCalled();
    });

    it('rejects when context does not belong to the project', async () => {
      const { service, contextService } = createService();
      contextService.validateContextIds.mockRejectedValue(new Error('invalid context'));

      await expect(service.setContextMembers(CONTEXT_ID, PROJECT_ID, ['u1'])).rejects.toThrow(
        'invalid context'
      );
    });
  });

  describe('updateMemberContexts', () => {
    it('should replace contexts for the member', async () => {
      const { service, contextService, memberRoleContextRepository } = createService();

      contextService.validateContextIds.mockResolvedValue(undefined);
      memberRoleContextRepository.delete.mockResolvedValue({ affected: 1 });
      memberRoleContextRepository.save.mockResolvedValue([]);

      await service.updateMemberContexts(TARGET_USER_ID, PROJECT_ID, CONTEXT_IDS);

      expect(contextService.validateContextIds).toHaveBeenCalledWith(CONTEXT_IDS, PROJECT_ID);
      expect(memberRoleContextRepository.delete).toHaveBeenCalledWith({
        userId: TARGET_USER_ID,
        projectId: PROJECT_ID,
      });
      expect(memberRoleContextRepository.save).toHaveBeenCalledWith(
        CONTEXT_IDS.map(contextId => ({
          userId: TARGET_USER_ID,
          projectId: PROJECT_ID,
          contextId,
        }))
      );
    });
  });

  describe('hasContextOverlap', () => {
    it('should return true when overlap exists', async () => {
      const { service, memberRoleContextRepository, dataMartContextRepository } = createService();

      memberRoleContextRepository.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-1' },
        { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-2' },
      ]);

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      };
      dataMartContextRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.hasContextOverlap(
        USER_ID,
        EntityType.DATA_MART,
        DATA_MART_ID,
        PROJECT_ID
      );

      expect(result).toBe(true);
    });

    it('should return false when no overlap', async () => {
      const { service, memberRoleContextRepository, storageContextRepository } = createService();

      memberRoleContextRepository.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-3' },
      ]);

      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      storageContextRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.hasContextOverlap(
        USER_ID,
        EntityType.STORAGE,
        STORAGE_ID,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });

    it('should return false when member has 0 contexts', async () => {
      const { service, memberRoleContextRepository } = createService();

      memberRoleContextRepository.find.mockResolvedValue([]);

      const result = await service.hasContextOverlap(
        USER_ID,
        EntityType.DATA_MART,
        DATA_MART_ID,
        PROJECT_ID
      );

      expect(result).toBe(false);
    });

    it('should query destination repository for DESTINATION entity type', async () => {
      const { service, memberRoleContextRepository, destinationContextRepository } =
        createService();

      memberRoleContextRepository.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-1' },
      ]);
      const qb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(1),
      };
      destinationContextRepository.createQueryBuilder.mockReturnValue(qb);

      const result = await service.hasContextOverlap(
        USER_ID,
        EntityType.DESTINATION,
        DESTINATION_ID,
        PROJECT_ID
      );

      expect(result).toBe(true);
      expect(qb.where).toHaveBeenCalledWith('ec.destination_id = :entityId', {
        entityId: DESTINATION_ID,
      });
    });

    it('should throw for unsupported entity type', async () => {
      const { service, memberRoleContextRepository } = createService();

      memberRoleContextRepository.find.mockResolvedValue([
        { userId: USER_ID, projectId: PROJECT_ID, contextId: 'ctx-1' },
      ]);

      await expect(
        service.hasContextOverlap(USER_ID, 'REPORT' as EntityType, 'x', PROJECT_ID)
      ).rejects.toThrow('Unsupported entity type for context overlap');
    });
  });
});
