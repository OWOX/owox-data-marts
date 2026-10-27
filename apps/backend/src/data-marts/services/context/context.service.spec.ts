import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { In } from 'typeorm';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../../idp/dto/domain/user-projections-list.dto';
import { Context } from '../../entities/context.entity';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextMapper } from '../../mappers/context.mapper';
import { ContextService } from './context.service';

jest.mock('../../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

jest.mock('typeorm-transactional', () => ({
  Transactional: () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
    descriptor,
  initializeTransactionalContext: jest.fn(),
}));

describe('ContextService', () => {
  const PROJECT_ID = 'project-1';
  const CONTEXT_ID = 'context-1';
  const USER_ID = 'user-1';

  const createMockRepository = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    softRemove: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  const createService = () => {
    const contextRepository = createMockRepository();
    const dataMartContextRepository = createMockRepository();
    const storageContextRepository = createMockRepository();
    const destinationContextRepository = createMockRepository();
    const memberRoleContextRepository = createMockRepository();
    const memberRoleScopeRepository = createMockRepository();
    const userProvisioningContextSettingsContextRepository = createMockRepository();
    const userProvisioningContextSettingsRepository = createMockRepository();

    // No member holds the context and no provisioning default is saved unless a test says otherwise.
    memberRoleContextRepository.find.mockResolvedValue([]);
    memberRoleScopeRepository.find.mockResolvedValue([]);
    userProvisioningContextSettingsRepository.findOne.mockResolvedValue(null);

    const contextMapper = new ContextMapper();

    const userProjectionsFetcherService = {
      fetchRelevantUserProjections: jest.fn(),
      fetchUserProjectionsList: jest.fn(),
      fetchUserProjection: jest.fn(),
      fetchCreatedByUser: jest.fn(),
    };

    const service = new ContextService(
      contextRepository as never,
      dataMartContextRepository as never,
      storageContextRepository as never,
      destinationContextRepository as never,
      memberRoleContextRepository as never,
      memberRoleScopeRepository as never,
      userProvisioningContextSettingsContextRepository as never,
      userProvisioningContextSettingsRepository as never,
      contextMapper,
      userProjectionsFetcherService as never
    );

    return {
      service,
      contextRepository,
      dataMartContextRepository,
      storageContextRepository,
      destinationContextRepository,
      memberRoleContextRepository,
      memberRoleScopeRepository,
      userProvisioningContextSettingsContextRepository,
      userProvisioningContextSettingsRepository,
      contextMapper,
      userProjectionsFetcherService,
    };
  };

  const createContextEntity = (overrides: Partial<Context> = {}): Context => {
    const ctx = new Context();
    ctx.id = CONTEXT_ID;
    ctx.name = 'Test Context';
    ctx.description = undefined;
    ctx.projectId = PROJECT_ID;
    ctx.createdById = USER_ID;
    ctx.createdAt = new Date('2026-01-01');
    ctx.modifiedAt = new Date('2026-01-01');
    return Object.assign(ctx, overrides);
  };

  const memberAssignment = (userId: string) => ({
    userId,
    projectId: PROJECT_ID,
    contextId: CONTEXT_ID,
  });

  const projectWideScope = (userId: string) => ({
    userId,
    projectId: PROJECT_ID,
    roleScope: RoleScope.ENTIRE_PROJECT,
  });

  const restrictedScope = (userId: string) => ({
    userId,
    projectId: PROJECT_ID,
    roleScope: RoleScope.SELECTED_CONTEXTS,
  });

  describe('create', () => {
    it('should successfully create a context', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();

      contextRepository.findOne.mockResolvedValue(null);
      const savedEntity = createContextEntity();
      contextRepository.create.mockReturnValue(savedEntity);
      contextRepository.save.mockResolvedValue(savedEntity);

      const projection = new UserProjectionDto(USER_ID, 'Test User', 'test@test.com', null);
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([projection])
      );

      const result = await service.create(PROJECT_ID, USER_ID, 'Test Context');

      expect(result.id).toBe(CONTEXT_ID);
      expect(result.name).toBe('Test Context');
      expect(result.projectId).toBe(PROJECT_ID);
      expect(result.createdById).toBe(USER_ID);
      expect(result.createdByUser).toEqual({
        userId: USER_ID,
        email: 'test@test.com',
        fullName: 'Test User',
        avatar: null,
      });
      expect(contextRepository.save).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate name in same project', async () => {
      const { service, contextRepository } = createService();

      contextRepository.findOne.mockResolvedValue(createContextEntity());

      await expect(service.create(PROJECT_ID, USER_ID, 'Test Context')).rejects.toThrow(
        ConflictException
      );
    });

    it('should translate UNIQUE-constraint race into ConflictException (TOCTOU)', async () => {
      const { service, contextRepository } = createService();

      // First check passes (no duplicate found at app-level), but DB rejects
      // the INSERT because a concurrent transaction inserted the same name.
      contextRepository.findOne.mockResolvedValue(null);
      contextRepository.create.mockReturnValue(createContextEntity());
      contextRepository.save.mockRejectedValue(
        Object.assign(new Error('UNIQUE constraint failed: context.projectId, context.name'), {
          code: 'SQLITE_CONSTRAINT_UNIQUE',
        })
      );

      await expect(service.create(PROJECT_ID, USER_ID, 'Race Context')).rejects.toBeInstanceOf(
        ConflictException
      );
    });

    it('should allow same name in different project', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();

      contextRepository.findOne.mockResolvedValue(null);
      const savedEntity = createContextEntity({ projectId: 'project-2' });
      contextRepository.create.mockReturnValue(savedEntity);
      contextRepository.save.mockResolvedValue(savedEntity);

      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.create('project-2', USER_ID, 'Test Context');

      expect(result.projectId).toBe('project-2');
    });

    it('should allow same name if existing is soft-deleted', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();

      // findOne with deletedAt IS NULL condition returns null (soft-deleted records excluded)
      contextRepository.findOne.mockResolvedValue(null);
      const savedEntity = createContextEntity();
      contextRepository.create.mockReturnValue(savedEntity);
      contextRepository.save.mockResolvedValue(savedEntity);

      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.create(PROJECT_ID, USER_ID, 'Test Context');

      expect(result.name).toBe('Test Context');
    });
  });

  describe('list', () => {
    it('should return only non-deleted contexts for project, ordered by name', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();

      const entities = [
        createContextEntity({ id: 'ctx-1', name: 'Alpha', createdById: 'user-1' }),
        createContextEntity({ id: 'ctx-2', name: 'Beta', createdById: 'user-2' }),
      ];
      contextRepository.find.mockResolvedValue(entities);

      const projection1 = new UserProjectionDto('user-1', 'User One', 'one@test.com', null);
      const projection2 = new UserProjectionDto('user-2', 'User Two', 'two@test.com', null);
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([projection1, projection2])
      );

      const result = await service.list(PROJECT_ID);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alpha');
      expect(result[1].name).toBe('Beta');
      expect(contextRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: PROJECT_ID },
          order: { name: 'ASC' },
        })
      );
    });
  });

  describe('icon', () => {
    it('saves the icon picked on create and returns it', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      contextRepository.findOne.mockResolvedValue(null);
      contextRepository.create.mockImplementation((data: Partial<Context>) =>
        createContextEntity(data)
      );
      contextRepository.save.mockImplementation((entity: Context) => Promise.resolve(entity));
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.create(
        PROJECT_ID,
        USER_ID,
        'Marketing',
        undefined,
        'lucide:megaphone'
      );

      expect(contextRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ icon: 'lucide:megaphone' })
      );
      expect(result.icon).toBe('lucide:megaphone');
    });

    it('creates a context without an icon as the default one', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      contextRepository.findOne.mockResolvedValue(null);
      contextRepository.create.mockImplementation((data: Partial<Context>) =>
        createContextEntity(data)
      );
      contextRepository.save.mockImplementation((entity: Context) => Promise.resolve(entity));
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.create(PROJECT_ID, USER_ID, 'Marketing');

      expect(result.icon).toBeNull();
    });

    it('keeps the icon when the name and description are updated', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      const existingEntity = createContextEntity({ icon: 'purchases' });
      contextRepository.findOne.mockResolvedValueOnce(existingEntity).mockResolvedValueOnce(null);
      contextRepository.save.mockImplementation((entity: Context) => Promise.resolve(entity));
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.update(CONTEXT_ID, PROJECT_ID, 'Renamed', 'New description');

      expect(contextRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Renamed', icon: 'purchases' })
      );
      expect(result.icon).toBe('purchases');
    });

    it('saves an icon sent with the name and description in the same update', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      contextRepository.findOne
        .mockResolvedValueOnce(createContextEntity({ icon: null }))
        .mockResolvedValueOnce(null);
      contextRepository.save.mockImplementation((entity: Context) => Promise.resolve(entity));
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.update(
        CONTEXT_ID,
        PROJECT_ID,
        'Renamed',
        'New description',
        'lucide:megaphone'
      );

      expect(contextRepository.save).toHaveBeenCalledTimes(1);
      expect(contextRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Renamed', icon: 'lucide:megaphone' })
      );
      expect(result.icon).toBe('lucide:megaphone');
    });

    it('resets the icon when the update sends null', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      contextRepository.findOne
        .mockResolvedValueOnce(createContextEntity({ icon: 'purchases' }))
        .mockResolvedValueOnce(null);
      contextRepository.save.mockImplementation((entity: Context) => Promise.resolve(entity));
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.update(CONTEXT_ID, PROJECT_ID, 'Test Context', undefined, null);

      expect(result.icon).toBeNull();
    });

    it('sets the icon only', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      const existingEntity = createContextEntity({ description: 'Kept', icon: null });
      contextRepository.findOne.mockResolvedValue(existingEntity);
      contextRepository.save.mockImplementation((entity: Context) => Promise.resolve(entity));
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.updateIcon(CONTEXT_ID, PROJECT_ID, 'lucide:megaphone');

      expect(contextRepository.findOne).toHaveBeenCalledWith({
        where: { id: CONTEXT_ID, projectId: PROJECT_ID },
      });
      expect(contextRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Context',
          description: 'Kept',
          icon: 'lucide:megaphone',
        })
      );
      expect(result.icon).toBe('lucide:megaphone');
    });

    it('resets the icon to the default with null', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      contextRepository.findOne.mockResolvedValue(createContextEntity({ icon: 'purchases' }));
      contextRepository.save.mockImplementation((entity: Context) => Promise.resolve(entity));
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.updateIcon(CONTEXT_ID, PROJECT_ID, null);

      expect(contextRepository.save).toHaveBeenCalledWith(expect.objectContaining({ icon: null }));
      expect(result.icon).toBeNull();
    });

    it('rejects an icon update for a context of another project', async () => {
      const { service, contextRepository } = createService();
      contextRepository.findOne.mockResolvedValue(null);

      await expect(service.updateIcon(CONTEXT_ID, 'other-project', 'purchases')).rejects.toThrow(
        NotFoundException
      );
      expect(contextRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update name and description', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();

      const existingEntity = createContextEntity();
      // First call: getByIdAndProject
      // Second call: duplicate name check (returns null - no duplicate)
      contextRepository.findOne.mockResolvedValueOnce(existingEntity).mockResolvedValueOnce(null);

      const updatedEntity = createContextEntity({
        name: 'Updated Name',
        description: 'New description',
      });
      contextRepository.save.mockResolvedValue(updatedEntity);

      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );

      const result = await service.update(
        CONTEXT_ID,
        PROJECT_ID,
        'Updated Name',
        'New description'
      );

      expect(result.name).toBe('Updated Name');
      expect(result.description).toBe('New description');
    });

    it('should throw NotFoundException for missing context', async () => {
      const { service, contextRepository } = createService();

      contextRepository.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent-id', PROJECT_ID, 'Name')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ConflictException on duplicate name (exclude self)', async () => {
      const { service, contextRepository } = createService();

      const existingEntity = createContextEntity();
      const duplicateEntity = createContextEntity({ id: 'context-2', name: 'Duplicate Name' });

      // First call: getByIdAndProject returns our entity
      // Second call: duplicate check returns another entity with same name
      contextRepository.findOne
        .mockResolvedValueOnce(existingEntity)
        .mockResolvedValueOnce(duplicateEntity);

      await expect(service.update(CONTEXT_ID, PROJECT_ID, 'Duplicate Name')).rejects.toThrow(
        ConflictException
      );
    });
  });

  describe('getImpact', () => {
    /** Members with selected_contexts scope whose only context is this one. */
    const mockAffectedMembers = (
      memberRoleContextRepository: ReturnType<typeof createMockRepository>,
      userIds: string[] = []
    ) => {
      memberRoleContextRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        andHaving: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(userIds.map(userId => ({ userId }))),
      });
    };

    it('should return correct counts for each join table', async () => {
      const {
        service,
        contextRepository,
        dataMartContextRepository,
        storageContextRepository,
        destinationContextRepository,
        memberRoleContextRepository,
        memberRoleScopeRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      const existingEntity = createContextEntity();
      contextRepository.findOne.mockResolvedValue(existingEntity);

      const memberIds = ['m-1', 'm-2', 'm-3', 'm-4'];
      dataMartContextRepository.count.mockResolvedValue(3);
      storageContextRepository.count.mockResolvedValue(2);
      destinationContextRepository.count.mockResolvedValue(1);
      memberRoleContextRepository.find.mockResolvedValue(memberIds.map(memberAssignment));
      memberRoleScopeRepository.find.mockResolvedValue(memberIds.map(restrictedScope));
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(5);
      mockAffectedMembers(memberRoleContextRepository);

      const result = await service.getImpact(CONTEXT_ID, PROJECT_ID);

      expect(result.contextId).toBe(CONTEXT_ID);
      expect(result.contextName).toBe('Test Context');
      expect(result.dataMartCount).toBe(3);
      expect(result.storageCount).toBe(2);
      expect(result.destinationCount).toBe(1);
      expect(result.memberCount).toBe(4);
      expect(result.userProvisioningDefaultsCount).toBe(5);
      expect(result.affectedMemberIds).toEqual([]);
    });

    it('does not count members whose scope is Entire project', async () => {
      const { service, contextRepository, memberRoleContextRepository, memberRoleScopeRepository } =
        createService();

      contextRepository.findOne.mockResolvedValue(createContextEntity());
      memberRoleContextRepository.find.mockResolvedValue(
        ['m-1', 'm-2', 'm-3'].map(memberAssignment)
      );
      memberRoleScopeRepository.find.mockResolvedValue([
        projectWideScope('m-1'),
        projectWideScope('m-2'),
        restrictedScope('m-3'),
      ]);
      mockAffectedMembers(memberRoleContextRepository);

      const result = await service.getImpact(CONTEXT_ID, PROJECT_ID);

      expect(result.memberCount).toBe(1);
      expect(memberRoleContextRepository.find).toHaveBeenCalledWith({
        where: { contextId: CONTEXT_ID, projectId: PROJECT_ID },
      });
      expect(memberRoleScopeRepository.find).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID, userId: In(['m-1', 'm-2', 'm-3']) },
      });
    });

    it('treats a member with no stored scope as the user provisioning default says', async () => {
      const {
        service,
        contextRepository,
        memberRoleContextRepository,
        userProvisioningContextSettingsRepository,
      } = createService();

      contextRepository.findOne.mockResolvedValue(createContextEntity());
      memberRoleContextRepository.find.mockResolvedValue(['m-1', 'm-2'].map(memberAssignment));
      mockAffectedMembers(memberRoleContextRepository);

      // No saved default: new members get Entire project.
      expect((await service.getImpact(CONTEXT_ID, PROJECT_ID)).memberCount).toBe(0);

      userProvisioningContextSettingsRepository.findOne.mockResolvedValue({
        projectId: PROJECT_ID,
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      expect((await service.getImpact(CONTEXT_ID, PROJECT_ID)).memberCount).toBe(2);
      expect(userProvisioningContextSettingsRepository.findOne).toHaveBeenCalledWith({
        where: { projectId: PROJECT_ID },
      });
    });

    it('should identify affected members (selected_contexts with only this context)', async () => {
      const {
        service,
        contextRepository,
        dataMartContextRepository,
        storageContextRepository,
        destinationContextRepository,
        memberRoleContextRepository,
        memberRoleScopeRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      const existingEntity = createContextEntity();
      contextRepository.findOne.mockResolvedValue(existingEntity);

      const memberIds = ['member-1', 'member-2'];
      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      memberRoleContextRepository.find.mockResolvedValue(memberIds.map(memberAssignment));
      memberRoleScopeRepository.find.mockResolvedValue(memberIds.map(restrictedScope));
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);
      mockAffectedMembers(memberRoleContextRepository, memberIds);

      const result = await service.getImpact(CONTEXT_ID, PROJECT_ID);

      expect(result.memberCount).toBe(2);
      expect(result.userProvisioningDefaultsCount).toBe(0);
      expect(result.affectedMemberIds).toEqual(['member-1', 'member-2']);
    });
  });

  describe('delete', () => {
    it('should soft-delete context when no attachments exist', async () => {
      const {
        service,
        contextRepository,
        dataMartContextRepository,
        storageContextRepository,
        destinationContextRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      const existingEntity = createContextEntity();
      contextRepository.findOne.mockResolvedValue(existingEntity);
      contextRepository.softRemove.mockResolvedValue(existingEntity);

      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);

      await service.delete(CONTEXT_ID, PROJECT_ID);

      expect(contextRepository.softRemove).toHaveBeenCalledWith(existingEntity);
      expect(dataMartContextRepository.delete).not.toHaveBeenCalled();
      expect(storageContextRepository.delete).not.toHaveBeenCalled();
      expect(destinationContextRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes a context held only by Entire project members and removes their assignments', async () => {
      const {
        service,
        contextRepository,
        dataMartContextRepository,
        storageContextRepository,
        destinationContextRepository,
        memberRoleContextRepository,
        memberRoleScopeRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      const existingEntity = createContextEntity();
      contextRepository.findOne.mockResolvedValue(existingEntity);
      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);
      // m-1 was switched to Entire project; m-2 has no stored scope and gets the default.
      memberRoleContextRepository.find.mockResolvedValue(['m-1', 'm-2'].map(memberAssignment));
      memberRoleScopeRepository.find.mockResolvedValue([projectWideScope('m-1')]);

      await service.delete(CONTEXT_ID, PROJECT_ID);

      expect(memberRoleContextRepository.delete).toHaveBeenCalledWith({
        contextId: CONTEXT_ID,
        projectId: PROJECT_ID,
      });
      expect(contextRepository.softRemove).toHaveBeenCalledWith(existingEntity);
      expect(memberRoleContextRepository.delete.mock.invocationCallOrder[0]).toBeLessThan(
        contextRepository.softRemove.mock.invocationCallOrder[0]
      );
    });

    it('blocks the delete while a Selected contexts member holds the context', async () => {
      const {
        service,
        contextRepository,
        dataMartContextRepository,
        storageContextRepository,
        destinationContextRepository,
        memberRoleContextRepository,
        memberRoleScopeRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      contextRepository.findOne.mockResolvedValue(createContextEntity());
      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);
      memberRoleContextRepository.find.mockResolvedValue(['m-1', 'm-2'].map(memberAssignment));
      memberRoleScopeRepository.find.mockResolvedValue([
        projectWideScope('m-1'),
        restrictedScope('m-2'),
      ]);

      await expect(service.delete(CONTEXT_ID, PROJECT_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ memberCount: 1 }),
      });

      expect(memberRoleContextRepository.delete).not.toHaveBeenCalled();
      expect(contextRepository.softRemove).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when context is attached to any resource or member', async () => {
      const {
        service,
        contextRepository,
        dataMartContextRepository,
        storageContextRepository,
        destinationContextRepository,
        memberRoleContextRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      const existingEntity = createContextEntity();
      contextRepository.findOne.mockResolvedValue(existingEntity);

      dataMartContextRepository.count.mockResolvedValue(2);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(1);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);

      await expect(service.delete(CONTEXT_ID, PROJECT_ID)).rejects.toBeInstanceOf(
        ConflictException
      );

      expect(memberRoleContextRepository.delete).not.toHaveBeenCalled();
      expect(contextRepository.softRemove).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when context is used by user provisioning defaults', async () => {
      const {
        service,
        contextRepository,
        dataMartContextRepository,
        storageContextRepository,
        destinationContextRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      const existingEntity = createContextEntity();
      contextRepository.findOne.mockResolvedValue(existingEntity);

      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(1);

      await expect(service.delete(CONTEXT_ID, PROJECT_ID)).rejects.toMatchObject({
        response: expect.objectContaining({
          userProvisioningDefaultsCount: 1,
        }),
      });

      expect(contextRepository.softRemove).not.toHaveBeenCalled();
    });
  });

  describe('validateContextIds', () => {
    it('should pass for valid ids', async () => {
      const { service, contextRepository } = createService();

      contextRepository.count.mockResolvedValue(2);

      await expect(
        service.validateContextIds(['ctx-1', 'ctx-2'], PROJECT_ID)
      ).resolves.not.toThrow();
    });

    it('should throw BadRequestException for non-existent id', async () => {
      const { service, contextRepository } = createService();

      // Only 1 found out of 2 requested
      contextRepository.count.mockResolvedValue(1);

      await expect(
        service.validateContextIds(['ctx-1', 'ctx-nonexistent'], PROJECT_ID)
      ).rejects.toThrow(BadRequestException);
    });
  });
});
