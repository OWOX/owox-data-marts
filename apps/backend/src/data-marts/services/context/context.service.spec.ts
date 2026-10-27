import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { UserProjectionDto } from '../../../idp/dto/domain/user-projection.dto';
import { UserProjectionsListDto } from '../../../idp/dto/domain/user-projections-list.dto';
import { Context } from '../../entities/context.entity';
import { DataMartIcon } from '../../enums/data-mart-icon.enum';
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
    update: jest.fn(),
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

    it('rejects an icon update for a context of another project', async () => {
      const { service, contextRepository } = createService();
      contextRepository.findOne.mockResolvedValue(null);
      await expect(
        service.update(CONTEXT_ID, 'other-project', undefined, undefined, DataMartIcon.PURCHASES)
      ).rejects.toThrow(NotFoundException);
      expect(contextRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it.each([
      {
        name: 'Renamed',
        description: 'New description',
        icon: undefined,
        patch: { name: 'Renamed', description: 'New description' },
      },
      {
        name: 'Renamed',
        description: 'New description',
        icon: 'lucide:megaphone',
        patch: { name: 'Renamed', description: 'New description', icon: 'lucide:megaphone' },
      },
      {
        name: undefined,
        description: undefined,
        icon: 'lucide:megaphone',
        patch: { icon: 'lucide:megaphone' },
      },
      { name: undefined, description: undefined, icon: null, patch: { icon: null } },
      {
        name: undefined,
        description: 'Updated',
        icon: undefined,
        patch: { description: 'Updated' },
      },
      { name: undefined, description: null, icon: null, patch: { description: null, icon: null } },
    ] as const)(
      'writes only supplied metadata and returns the persisted Context: %p',
      async ({ name, description, icon, patch }) => {
        const { service, contextRepository, userProjectionsFetcherService } = createService();
        const entity = createContextEntity({ description: 'Keep', icon: DataMartIcon.PURCHASES });
        contextRepository.findOne.mockImplementation(async ({ where }) =>
          where.id === CONTEXT_ID ? { ...entity } : null
        );
        contextRepository.update.mockImplementation(async (_where, changes) => {
          Object.assign(entity, changes);
          return { affected: 1 };
        });
        userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
          new UserProjectionsListDto([])
        );
        const result = await service.update(CONTEXT_ID, PROJECT_ID, name, description, icon);
        expect(contextRepository.update).toHaveBeenCalledWith(
          { id: CONTEXT_ID, projectId: PROJECT_ID },
          patch
        );
        expect(result).toMatchObject({
          id: CONTEXT_ID,
          name: entity.name,
          description: entity.description,
          icon: entity.icon,
        });
      }
    );

    it('preserves fields changed by another update after loading the Context', async () => {
      const { service, contextRepository, userProjectionsFetcherService } = createService();
      const stale = createContextEntity({ description: 'Old notes', icon: null });
      const current = createContextEntity({ description: 'New notes', icon: null });
      contextRepository.findOne
        .mockResolvedValueOnce(stale)
        .mockImplementation(async () => ({ ...current }));
      contextRepository.update.mockImplementation(async (_where, patch) => {
        Object.assign(current, patch);
        return { affected: 1 };
      });
      userProjectionsFetcherService.fetchUserProjectionsList.mockResolvedValue(
        new UserProjectionsListDto([])
      );
      const result = await service.update(
        CONTEXT_ID,
        PROJECT_ID,
        undefined,
        undefined,
        DataMartIcon.PURCHASES
      );
      expect(result).toMatchObject({ description: 'New notes', icon: 'purchases' });
      expect(current.description).toBe('New notes');
    });

    it('translates a database uniqueness conflict during an update', async () => {
      const { service, contextRepository } = createService();
      contextRepository.findOne
        .mockResolvedValueOnce(createContextEntity())
        .mockResolvedValueOnce(null);
      contextRepository.update.mockRejectedValue(
        new QueryFailedError(
          'UPDATE context',
          [],
          Object.assign(new Error('UNIQUE constraint failed: context.projectId, context.name'), {
            code: 'SQLITE_CONSTRAINT',
          })
        )
      );
      await expect(service.update(CONTEXT_ID, PROJECT_ID, 'Duplicate')).rejects.toThrow(
        'Context with name "Duplicate" already exists in this project'
      );
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
    it('should return correct counts for each join table', async () => {
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

      dataMartContextRepository.count.mockResolvedValue(3);
      storageContextRepository.count.mockResolvedValue(2);
      destinationContextRepository.count.mockResolvedValue(1);
      memberRoleContextRepository.count.mockResolvedValue(4);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(5);

      // No affected members (those with selected_contexts scope and only this context)
      memberRoleContextRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        andHaving: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      });

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

    it('should identify affected members (selected_contexts with only this context)', async () => {
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

      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      memberRoleContextRepository.count.mockResolvedValue(2);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);

      // Two members with selected_contexts scope that only have this context
      memberRoleContextRepository.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        having: jest.fn().mockReturnThis(),
        andHaving: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([{ userId: 'member-1' }, { userId: 'member-2' }]),
      });

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
        memberRoleContextRepository,
        userProvisioningContextSettingsContextRepository,
      } = createService();

      const existingEntity = createContextEntity();
      contextRepository.findOne.mockResolvedValue(existingEntity);
      contextRepository.softRemove.mockResolvedValue(existingEntity);

      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      memberRoleContextRepository.count.mockResolvedValue(0);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);

      await service.delete(CONTEXT_ID, PROJECT_ID);

      expect(contextRepository.softRemove).toHaveBeenCalledWith(existingEntity);
      expect(dataMartContextRepository.delete).not.toHaveBeenCalled();
      expect(storageContextRepository.delete).not.toHaveBeenCalled();
      expect(destinationContextRepository.delete).not.toHaveBeenCalled();
      expect(memberRoleContextRepository.delete).not.toHaveBeenCalled();
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
      memberRoleContextRepository.count.mockResolvedValue(0);
      userProvisioningContextSettingsContextRepository.count.mockResolvedValue(0);

      await expect(service.delete(CONTEXT_ID, PROJECT_ID)).rejects.toBeInstanceOf(
        ConflictException
      );

      expect(contextRepository.softRemove).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when context is used by user provisioning defaults', async () => {
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

      dataMartContextRepository.count.mockResolvedValue(0);
      storageContextRepository.count.mockResolvedValue(0);
      destinationContextRepository.count.mockResolvedValue(0);
      memberRoleContextRepository.count.mockResolvedValue(0);
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
