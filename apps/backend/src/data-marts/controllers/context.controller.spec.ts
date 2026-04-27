jest.mock('../../idp', () => {
  const noop = () => () => undefined;
  return {
    Auth: noop,
    AuthContext: noop,
    Role: { admin: () => 'admin', editor: () => 'editor', viewer: () => 'viewer' },
    Strategy: { INTROSPECT: 'INTROSPECT', PARSE: 'PARSE' },
  };
});

jest.mock('../../idp/facades/idp-projections.facade', () => ({
  IdpProjectionsFacade: jest.fn(),
}));

import { ContextController } from './context.controller';
import type { AuthorizationContext } from '../../idp/types/auth.types';
import type { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';

describe('ContextController', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';
  const CONTEXT_ID = 'ctx-1';
  const DATA_MART_ID = 'dm-1';

  const makeAuthContext = (overrides: Partial<AuthorizationContext> = {}): AuthorizationContext =>
    ({
      projectId: PROJECT_ID,
      userId: USER_ID,
      roles: ['admin'],
      ...overrides,
    }) as AuthorizationContext;

  const createController = () => {
    const contextService = {
      create: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
      getImpact: jest.fn(),
      delete: jest.fn(),
      validateContextIds: jest.fn().mockResolvedValue(undefined),
    };

    const contextAccessService = {
      getRoleScope: jest.fn(),
      getMemberContextIds: jest.fn(),
      updateDataMartContexts: jest.fn(),
      updateStorageContexts: jest.fn(),
      updateDestinationContexts: jest.fn(),
      updateMember: jest.fn(),
      removeMemberBindings: jest.fn(),
      setContextMembers: jest.fn(),
    };

    const contextMapper = {
      toResponse: jest.fn((dto: ContextDto) => ({
        id: dto.id,
        name: dto.name,
        description: dto.description,
        createdById: dto.createdById,
        createdByUser: dto.createdByUser,
        createdAt: dto.createdAt,
      })),
    };

    const setContextMembersService = {
      run: jest.fn().mockResolvedValue({ assignedUserIds: [], droppedAdminIds: [] }),
    };

    const controller = new ContextController(
      contextService as never,
      contextAccessService as never,
      contextMapper as never,
      setContextMembersService as never
    );

    return {
      controller,
      contextService,
      contextAccessService,
      contextMapper,
      setContextMembersService,
    };
  };

  const sampleContextDto: ContextDto = {
    id: CONTEXT_ID,
    name: 'Marketing',
    description: 'Marketing ctx',
    projectId: PROJECT_ID,
    createdById: USER_ID,
    createdByUser: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  } as ContextDto;

  describe('create', () => {
    it('creates context and maps to response', async () => {
      const { controller, contextService, contextMapper } = createController();
      contextService.create.mockResolvedValue(sampleContextDto);

      const result = await controller.create(makeAuthContext(), {
        name: 'Marketing',
        description: 'Marketing ctx',
      });

      expect(contextService.create).toHaveBeenCalledWith(
        PROJECT_ID,
        USER_ID,
        'Marketing',
        'Marketing ctx'
      );
      expect(contextMapper.toResponse).toHaveBeenCalledWith(sampleContextDto);
      expect(result.id).toBe(CONTEXT_ID);
    });
  });

  describe('list', () => {
    it('lists all contexts for project', async () => {
      const { controller, contextService, contextMapper } = createController();
      contextService.list.mockResolvedValue([sampleContextDto, sampleContextDto]);

      const result = await controller.list(makeAuthContext());

      expect(contextService.list).toHaveBeenCalledWith(PROJECT_ID);
      expect(result).toHaveLength(2);
      expect(contextMapper.toResponse).toHaveBeenCalledTimes(2);
    });

    it('returns empty list when no contexts', async () => {
      const { controller, contextService } = createController();
      contextService.list.mockResolvedValue([]);

      const result = await controller.list(makeAuthContext());

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates context and maps to response', async () => {
      const { controller, contextService, contextMapper } = createController();
      contextService.update.mockResolvedValue(sampleContextDto);

      const result = await controller.update(makeAuthContext(), CONTEXT_ID, {
        name: 'Marketing 2',
        description: 'Updated',
      });

      expect(contextService.update).toHaveBeenCalledWith(
        CONTEXT_ID,
        PROJECT_ID,
        'Marketing 2',
        'Updated'
      );
      expect(contextMapper.toResponse).toHaveBeenCalledWith(sampleContextDto);
      expect(result.id).toBe(CONTEXT_ID);
    });
  });

  describe('getImpact', () => {
    it('returns full impact dto', async () => {
      const { controller, contextService } = createController();
      const impact: ContextImpactDto = {
        contextId: CONTEXT_ID,
        contextName: 'Marketing',
        dataMartCount: 2,
        storageCount: 1,
        destinationCount: 0,
        memberCount: 3,
        affectedMemberIds: ['u1', 'u2'],
      };
      contextService.getImpact.mockResolvedValue(impact);

      const result = await controller.getImpact(makeAuthContext(), CONTEXT_ID);

      expect(contextService.getImpact).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID);
      expect(result).toEqual(impact);
    });
  });

  describe('delete', () => {
    it('delegates to context service and returns void', async () => {
      const { controller, contextService } = createController();
      contextService.delete.mockResolvedValue(undefined);

      await expect(controller.delete(makeAuthContext(), CONTEXT_ID)).resolves.toBeUndefined();

      expect(contextService.delete).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID);
    });
  });

  describe('updateDataMartContexts', () => {
    it('forwards to context-access service with auth context', async () => {
      const { controller, contextAccessService } = createController();
      contextAccessService.updateDataMartContexts.mockResolvedValue(undefined);

      await controller.updateDataMartContexts(
        makeAuthContext({ roles: ['editor'] }),
        DATA_MART_ID,
        { contextIds: ['ctx-1'] }
      );

      expect(contextAccessService.updateDataMartContexts).toHaveBeenCalledWith(
        DATA_MART_ID,
        PROJECT_ID,
        ['ctx-1'],
        USER_ID,
        ['editor']
      );
    });

    it('uses empty roles array when roles missing from auth context', async () => {
      const { controller, contextAccessService } = createController();
      contextAccessService.updateDataMartContexts.mockResolvedValue(undefined);

      await controller.updateDataMartContexts(makeAuthContext({ roles: undefined }), DATA_MART_ID, {
        contextIds: [],
      });

      expect(contextAccessService.updateDataMartContexts).toHaveBeenCalledWith(
        DATA_MART_ID,
        PROJECT_ID,
        [],
        USER_ID,
        []
      );
    });
  });

  describe('setContextMembers', () => {
    it('forwards the request to SetContextMembersService and returns the result', async () => {
      const { controller, setContextMembersService } = createController();
      setContextMembersService.run.mockResolvedValue({
        assignedUserIds: ['1', '2'],
        droppedAdminIds: ['0'],
      });

      const result = await controller.setContextMembers(makeAuthContext(), CONTEXT_ID, {
        assignedUserIds: ['0', '1', '2'],
      });

      expect(setContextMembersService.run).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, [
        '0',
        '1',
        '2',
      ]);
      expect(result.assignedUserIds).toEqual(['1', '2']);
      expect(result.droppedAdminIds).toEqual(['0']);
    });

    it('propagates service errors', async () => {
      const { controller, setContextMembersService } = createController();
      setContextMembersService.run.mockRejectedValue(new Error('invalid context'));

      await expect(
        controller.setContextMembers(makeAuthContext(), CONTEXT_ID, {
          assignedUserIds: ['1'],
        })
      ).rejects.toThrow('invalid context');
    });
  });
});
