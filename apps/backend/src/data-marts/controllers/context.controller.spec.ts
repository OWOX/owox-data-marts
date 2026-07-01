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
import { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';

describe('ContextController', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';
  const CONTEXT_ID = 'ctx-1';

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
      toApiResponse: jest.fn((dto: ContextDto) => ({
        id: dto.id,
        name: dto.name,
        description: dto.description,
        createdById: dto.createdById,
        createdByUser: dto.createdByUser,
        createdAt: dto.createdAt,
        modifiedAt: dto.modifiedAt,
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

  const sampleContextDto = new ContextDto(
    CONTEXT_ID,
    'Marketing',
    'Marketing ctx',
    PROJECT_ID,
    USER_ID,
    null,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z')
  );

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
      expect(contextMapper.toApiResponse).toHaveBeenCalledWith(sampleContextDto);
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
      expect(contextMapper.toApiResponse).toHaveBeenCalledTimes(2);
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
      expect(contextMapper.toApiResponse).toHaveBeenCalledWith(sampleContextDto);
      expect(result.id).toBe(CONTEXT_ID);
    });
  });

  describe('getImpact', () => {
    it('returns full impact dto', async () => {
      const { controller, contextService } = createController();
      const impact = new ContextImpactDto(CONTEXT_ID, 'Marketing', 2, 1, 0, 3, 1, ['u1', 'u2']);
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

  // updateDataMartContexts moved to DataMartController (`PUT /data-marts/:id/contexts`)
  // for path consistency with the rest of the data-mart sub-routes; behaviour
  // is covered by ContextAccessService unit tests and the
  // permissions-contexts.e2e suite.

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
