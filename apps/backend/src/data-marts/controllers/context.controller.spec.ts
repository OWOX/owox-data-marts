import { ForbiddenException, NotFoundException } from '@nestjs/common';

// Controller detects upstream IDP 404s by `error.name === 'IdpNotFoundException'`
// (see context.controller.ts), so this test fake just has to match that name.
// Using a local class avoids pulling in the ESM-only @owox/idp-owox-better-auth
// package through ts-jest.
class IdpNotFoundException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'IdpNotFoundException';
  }
}

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
import { RoleScope } from '../enums/role-scope.enum';
import type { ContextDto, ContextImpactDto } from '../dto/domain/context.dto';

describe('ContextController', () => {
  const PROJECT_ID = 'project-1';
  const USER_ID = 'user-1';
  const TARGET_USER_ID = 'user-2';
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

    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
      inviteMember: jest.fn(),
      removeMember: jest.fn(),
      changeMemberRole: jest.fn(),
    };

    const controller = new ContextController(
      contextService as never,
      contextAccessService as never,
      contextMapper as never,
      idpProjectionsFacade as never
    );

    return {
      controller,
      contextService,
      contextAccessService,
      contextMapper,
      idpProjectionsFacade,
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

  describe('listMembers', () => {
    it('enriches members with roleScope and contextIds', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        {
          userId: 'u1',
          email: 'u1@test.io',
          displayName: 'User One',
          avatarUrl: 'https://x/y.png',
          role: 'admin',
        },
        {
          userId: 'u2',
          email: 'u2@test.io',
          displayName: undefined,
          avatarUrl: undefined,
          role: 'editor',
        },
      ]);
      contextAccessService.getRoleScope
        .mockResolvedValueOnce(RoleScope.ENTIRE_PROJECT)
        .mockResolvedValueOnce(RoleScope.SELECTED_CONTEXTS);
      contextAccessService.getMemberContextIds
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['ctx-1', 'ctx-2']);

      const result = await controller.listMembers(makeAuthContext());

      expect(result).toEqual([
        {
          userId: 'u1',
          email: 'u1@test.io',
          displayName: 'User One',
          avatarUrl: 'https://x/y.png',
          role: 'admin',
          roleScope: RoleScope.ENTIRE_PROJECT,
          contextIds: [],
        },
        {
          userId: 'u2',
          email: 'u2@test.io',
          displayName: undefined,
          avatarUrl: undefined,
          role: 'editor',
          roleScope: RoleScope.SELECTED_CONTEXTS,
          contextIds: ['ctx-1', 'ctx-2'],
        },
      ]);
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

  describe('updateMember', () => {
    it('same role — does not call IDP, persists scope/contexts, returns ok', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: TARGET_USER_ID, email: 'u2@test.io', role: 'editor' },
      ]);
      contextAccessService.updateMember.mockResolvedValue(undefined);
      contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
      contextAccessService.getMemberContextIds.mockResolvedValue(['ctx-1']);

      const result = await controller.updateMember(makeAuthContext(), TARGET_USER_ID, {
        role: 'editor',
        roleScope: 'selected_contexts',
        contextIds: ['ctx-1'],
      });

      expect(idpProjectionsFacade.changeMemberRole).not.toHaveBeenCalled();
      expect(contextAccessService.updateMember).toHaveBeenCalledWith(TARGET_USER_ID, PROJECT_ID, {
        role: 'editor',
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
      });
      expect(result).toEqual({
        userId: TARGET_USER_ID,
        role: 'editor',
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
        roleStatus: 'ok',
      });
    });

    it('different role — calls IDP changeMemberRole before touching local scope', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: TARGET_USER_ID, email: 'u2@test.io', role: 'viewer' },
      ]);
      idpProjectionsFacade.changeMemberRole.mockResolvedValue(undefined);
      contextAccessService.updateMember.mockResolvedValue(undefined);
      contextAccessService.getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      contextAccessService.getMemberContextIds.mockResolvedValue([]);

      const result = await controller.updateMember(makeAuthContext(), TARGET_USER_ID, {
        role: 'editor',
        roleScope: 'entire_project',
        contextIds: [],
      });

      expect(idpProjectionsFacade.changeMemberRole).toHaveBeenCalledWith(
        PROJECT_ID,
        TARGET_USER_ID,
        'editor',
        USER_ID
      );
      expect(contextAccessService.updateMember).toHaveBeenCalled();
      // Order: IDP call must happen before local persistence.
      expect(idpProjectionsFacade.changeMemberRole.mock.invocationCallOrder[0]).toBeLessThan(
        contextAccessService.updateMember.mock.invocationCallOrder[0]
      );
      expect(result.role).toBe('editor');
      expect(result.roleStatus).toBe('ok');
    });

    it('propagates IDP failure without touching local scope', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: TARGET_USER_ID, email: 'u2@test.io', role: 'viewer' },
      ]);
      idpProjectionsFacade.changeMemberRole.mockRejectedValue(new Error('IDP unavailable'));

      await expect(
        controller.updateMember(makeAuthContext(), TARGET_USER_ID, {
          role: 'editor',
          roleScope: 'entire_project',
          contextIds: [],
        })
      ).rejects.toThrow('IDP unavailable');

      expect(contextAccessService.updateMember).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when target member is not in the project', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'other-user', email: 'o@test.io', role: 'admin' },
      ]);

      await expect(
        controller.updateMember(makeAuthContext(), TARGET_USER_ID, {
          role: 'editor',
          roleScope: 'entire_project',
          contextIds: [],
        })
      ).rejects.toThrow(NotFoundException);

      expect(idpProjectionsFacade.changeMemberRole).not.toHaveBeenCalled();
      expect(contextAccessService.updateMember).not.toHaveBeenCalled();
    });

    it('rejects self-modification with 403 before contacting IDP or local store', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();

      await expect(
        controller.updateMember(makeAuthContext(), USER_ID, {
          role: 'viewer',
          roleScope: 'entire_project',
          contextIds: [],
        })
      ).rejects.toThrow(ForbiddenException);

      expect(idpProjectionsFacade.getProjectMembers).not.toHaveBeenCalled();
      expect(idpProjectionsFacade.changeMemberRole).not.toHaveBeenCalled();
      expect(contextAccessService.updateMember).not.toHaveBeenCalled();
    });

    it('maps upstream 404 on changeMemberRole to NestJS NotFoundException', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: TARGET_USER_ID, email: 'u2@test.io', role: 'viewer' },
      ]);
      idpProjectionsFacade.changeMemberRole.mockRejectedValue(
        new IdpNotFoundException('member gone')
      );

      await expect(
        controller.updateMember(makeAuthContext(), TARGET_USER_ID, {
          role: 'editor',
          roleScope: 'entire_project',
          contextIds: [],
        })
      ).rejects.toThrow(NotFoundException);

      expect(contextAccessService.updateMember).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('calls IDP removeMember then clears local bindings', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: TARGET_USER_ID, email: 'u2@test.io', role: 'viewer' },
      ]);
      idpProjectionsFacade.removeMember.mockResolvedValue(undefined);
      contextAccessService.removeMemberBindings.mockResolvedValue(undefined);

      await expect(
        controller.removeMember(makeAuthContext(), TARGET_USER_ID)
      ).resolves.toBeUndefined();

      expect(idpProjectionsFacade.removeMember).toHaveBeenCalledWith(
        PROJECT_ID,
        TARGET_USER_ID,
        USER_ID
      );
      expect(contextAccessService.removeMemberBindings).toHaveBeenCalledWith(
        TARGET_USER_ID,
        PROJECT_ID
      );
      // Order: IDP call first, local cleanup after.
      expect(idpProjectionsFacade.removeMember.mock.invocationCallOrder[0]).toBeLessThan(
        contextAccessService.removeMemberBindings.mock.invocationCallOrder[0]
      );
    });

    it('throws NotFoundException when target member is not in the project', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: 'other-user', email: 'o@test.io', role: 'admin' },
      ]);

      await expect(controller.removeMember(makeAuthContext(), TARGET_USER_ID)).rejects.toThrow(
        NotFoundException
      );

      expect(idpProjectionsFacade.removeMember).not.toHaveBeenCalled();
      expect(contextAccessService.removeMemberBindings).not.toHaveBeenCalled();
    });

    it('does not clear local bindings if IDP removal fails', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: TARGET_USER_ID, email: 'u2@test.io', role: 'viewer' },
      ]);
      idpProjectionsFacade.removeMember.mockRejectedValue(new Error('upstream 500'));

      await expect(controller.removeMember(makeAuthContext(), TARGET_USER_ID)).rejects.toThrow(
        'upstream 500'
      );

      expect(contextAccessService.removeMemberBindings).not.toHaveBeenCalled();
    });

    it('rejects self-removal with 403 before touching IDP or local store', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();

      await expect(controller.removeMember(makeAuthContext(), USER_ID)).rejects.toThrow(
        ForbiddenException
      );

      expect(idpProjectionsFacade.getProjectMembers).not.toHaveBeenCalled();
      expect(idpProjectionsFacade.removeMember).not.toHaveBeenCalled();
      expect(contextAccessService.removeMemberBindings).not.toHaveBeenCalled();
    });

    it('treats upstream 404 as idempotent success and still clears local bindings', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: TARGET_USER_ID, email: 'u2@test.io', role: 'viewer' },
      ]);
      idpProjectionsFacade.removeMember.mockRejectedValue(
        new IdpNotFoundException('member not found upstream')
      );
      contextAccessService.removeMemberBindings.mockResolvedValue(undefined);

      await expect(
        controller.removeMember(makeAuthContext(), TARGET_USER_ID)
      ).resolves.toBeUndefined();

      expect(contextAccessService.removeMemberBindings).toHaveBeenCalledWith(
        TARGET_USER_ID,
        PROJECT_ID
      );
    });
  });

  describe('inviteMember', () => {
    it('email-sent kind — returns confirmation without magic link', async () => {
      const { controller, idpProjectionsFacade } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'new@test.io',
        role: 'editor',
        kind: 'email-sent',
        message: 'Invitation email sent to new@test.io',
      });

      const result = await controller.inviteMember(makeAuthContext(), {
        email: 'new@test.io',
        role: 'editor',
        contextIds: ['ctx-1'],
      });

      expect(idpProjectionsFacade.inviteMember).toHaveBeenCalledWith(
        PROJECT_ID,
        'new@test.io',
        'editor',
        USER_ID
      );
      expect(result).toEqual({
        email: 'new@test.io',
        role: 'editor',
        kind: 'email-sent',
        message: 'Invitation email sent to new@test.io',
      });
      expect(result.magicLink).toBeUndefined();
    });

    it('magic-link kind — surfaces the link and optional expiresAt', async () => {
      const { controller, idpProjectionsFacade } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'x@y.io',
        role: 'viewer',
        kind: 'magic-link',
        magicLink: 'https://app/invite/abc',
        expiresAt: '2026-05-01T00:00:00Z',
      });

      const result = await controller.inviteMember(makeAuthContext(), {
        email: 'x@y.io',
        role: 'viewer',
      });

      expect(result).toEqual({
        email: 'x@y.io',
        role: 'viewer',
        kind: 'magic-link',
        magicLink: 'https://app/invite/abc',
        expiresAt: '2026-05-01T00:00:00Z',
        message: undefined,
      });
    });

    it('propagates IDP failure', async () => {
      const { controller, idpProjectionsFacade } = createController();
      idpProjectionsFacade.inviteMember.mockRejectedValue(new Error('IDP refused'));

      await expect(
        controller.inviteMember(makeAuthContext(), { email: 'x@y.io', role: 'viewer' })
      ).rejects.toThrow('IDP refused');
    });

    it('pre-provisioned userId + contextIds → applies selected_contexts scope', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'pre@test.io',
        role: 'editor',
        kind: 'magic-link',
        magicLink: 'https://app/invite/tok',
        userId: 'new-user-id',
      });
      contextAccessService.updateMember.mockResolvedValue(undefined);

      await controller.inviteMember(makeAuthContext(), {
        email: 'pre@test.io',
        role: 'editor',
        contextIds: ['ctx-1', 'ctx-2'],
      });

      expect(contextAccessService.updateMember).toHaveBeenCalledWith('new-user-id', PROJECT_ID, {
        role: 'editor',
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1', 'ctx-2'],
      });
    });

    it('pre-provisioned userId + no contextIds → applies entire_project scope', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'wide@test.io',
        role: 'admin',
        kind: 'magic-link',
        magicLink: 'https://app/invite/tok2',
        userId: 'admin-stub',
      });
      contextAccessService.updateMember.mockResolvedValue(undefined);

      await controller.inviteMember(makeAuthContext(), {
        email: 'wide@test.io',
        role: 'admin',
      });

      expect(contextAccessService.updateMember).toHaveBeenCalledWith('admin-stub', PROJECT_ID, {
        role: 'admin',
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: [],
      });
    });

    it('no userId (IDP has no pre-provision) → does not touch local bindings', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'deferred@test.io',
        role: 'viewer',
        kind: 'email-sent',
      });

      await controller.inviteMember(makeAuthContext(), {
        email: 'deferred@test.io',
        role: 'viewer',
        contextIds: ['ctx-1'],
      });

      expect(contextAccessService.updateMember).not.toHaveBeenCalled();
    });

    it('explicit roleScope=selected_contexts + empty contextIds → forwards as-is (valid "no shared access" state)', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'scoped@test.io',
        role: 'editor',
        kind: 'magic-link',
        magicLink: 'https://app/invite/tok3',
        userId: 'scoped-stub',
      });
      contextAccessService.updateMember.mockResolvedValue(undefined);

      await controller.inviteMember(makeAuthContext(), {
        email: 'scoped@test.io',
        role: 'editor',
        roleScope: 'selected_contexts',
      });

      expect(contextAccessService.updateMember).toHaveBeenCalledWith('scoped-stub', PROJECT_ID, {
        role: 'editor',
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: [],
      });
    });

    it('explicit roleScope=entire_project + contextIds → honours explicit scope, still records contexts', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'wide@test.io',
        role: 'viewer',
        kind: 'magic-link',
        magicLink: 'https://app/invite/tok4',
        userId: 'wide-stub',
      });
      contextAccessService.updateMember.mockResolvedValue(undefined);

      await controller.inviteMember(makeAuthContext(), {
        email: 'wide@test.io',
        role: 'viewer',
        roleScope: 'entire_project',
        contextIds: ['ctx-1'],
      });

      expect(contextAccessService.updateMember).toHaveBeenCalledWith('wide-stub', PROJECT_ID, {
        role: 'viewer',
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: ['ctx-1'],
      });
    });

    it('admin role overrides any explicit roleScope the client sent', async () => {
      const { controller, idpProjectionsFacade, contextAccessService } = createController();
      idpProjectionsFacade.inviteMember.mockResolvedValue({
        projectId: PROJECT_ID,
        email: 'adm@test.io',
        role: 'admin',
        kind: 'magic-link',
        magicLink: 'https://app/invite/tok5',
        userId: 'adm-stub',
      });
      contextAccessService.updateMember.mockResolvedValue(undefined);

      await controller.inviteMember(makeAuthContext(), {
        email: 'adm@test.io',
        role: 'admin',
        roleScope: 'selected_contexts',
        contextIds: ['ctx-1'],
      });

      expect(contextAccessService.updateMember).toHaveBeenCalledWith('adm-stub', PROJECT_ID, {
        role: 'admin',
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: ['ctx-1'],
      });
    });
  });

  describe('setContextMembers', () => {
    it('filters admin user ids and forwards non-admin ones to the service', async () => {
      const { controller, contextAccessService, idpProjectionsFacade } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: '0', email: 'a@x.io', role: 'admin' },
        { userId: '1', email: 'e@x.io', role: 'editor' },
        { userId: '2', email: 'v@x.io', role: 'viewer' },
      ]);
      contextAccessService.setContextMembers.mockResolvedValue(undefined);

      await controller.setContextMembers(makeAuthContext(), CONTEXT_ID, {
        assignedUserIds: ['0', '1', '2', 'stranger'],
      });

      expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, [
        '1',
        '2',
      ]);
    });

    it('propagates service errors', async () => {
      const { controller, contextAccessService, idpProjectionsFacade } = createController();
      idpProjectionsFacade.getProjectMembers.mockResolvedValue([
        { userId: '1', email: 'e@x.io', role: 'editor' },
      ]);
      contextAccessService.setContextMembers.mockRejectedValue(new Error('invalid context'));

      await expect(
        controller.setContextMembers(makeAuthContext(), CONTEXT_ID, {
          assignedUserIds: ['1'],
        })
      ).rejects.toThrow('invalid context');
    });
  });
});
