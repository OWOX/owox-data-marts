import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { ApproveMembershipRequestCommand } from '../../dto/domain/approve-membership-request.command';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ApproveMembershipRequestService } from './approve-membership-request.service';
import { LOCAL_MEMBER_SCOPE_PARTIAL_FAILURE_MESSAGE } from './util/member-scope-saga.util';

describe('ApproveMembershipRequestService', () => {
  const PROJECT_ID = 'project-1';
  const ACTOR_ID = 'admin-1';
  const REQUEST_ID = 'req-1';

  const createService = () => {
    const idpProjectionsFacade = {
      approveMembershipRequest: jest.fn(),
    };

    let lastWrite: { roleScope: RoleScope; contextIds: string[] } = {
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    };
    const contextAccessService = {
      updateMember: jest.fn(async (_userId, _projectId, payload) => {
        const coercedScope =
          payload.role === ProjectRole.ADMIN ? RoleScope.ENTIRE_PROJECT : payload.roleScope;
        const coercedContexts = payload.role === ProjectRole.ADMIN ? [] : payload.contextIds;
        lastWrite = { roleScope: coercedScope, contextIds: coercedContexts };
        return undefined;
      }),
      getRoleScope: jest.fn(async () => lastWrite.roleScope),
      getMemberContextIds: jest.fn(async () => lastWrite.contextIds),
    };
    const contextService = {
      validateContextIds: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ApproveMembershipRequestService(
      idpProjectionsFacade as never,
      contextAccessService as never,
      contextService as never
    );
    return { service, idpProjectionsFacade, contextAccessService, contextService };
  };

  const command = (
    overrides: Partial<ApproveMembershipRequestCommand> = {}
  ): ApproveMembershipRequestCommand =>
    new ApproveMembershipRequestCommand(
      overrides.projectId ?? PROJECT_ID,
      overrides.actorUserId ?? ACTOR_ID,
      overrides.requestId ?? REQUEST_ID,
      overrides.role ?? ProjectRole.EDITOR,
      overrides.roleScope,
      overrides.contextIds ?? []
    );

  it('non-admin + no contextIds + no explicit scope → entire_project, applies via ContextAccessService', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'user-1',
    });

    const result = await service.run(command({ role: ProjectRole.EDITOR }));

    expect(idpProjectionsFacade.approveMembershipRequest).toHaveBeenCalledWith(
      PROJECT_ID,
      REQUEST_ID,
      ProjectRole.EDITOR,
      ACTOR_ID
    );
    expect(contextAccessService.updateMember).toHaveBeenCalledWith('user-1', PROJECT_ID, {
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });
    expect(result).toEqual({
      userId: 'user-1',
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });
  });

  it('non-admin + contextIds → defaults to selected_contexts and validates ids', async () => {
    const { service, idpProjectionsFacade, contextAccessService, contextService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'user-2',
    });

    const result = await service.run(
      command({ role: ProjectRole.EDITOR, contextIds: ['ctx-1', 'ctx-2'] })
    );

    expect(contextService.validateContextIds).toHaveBeenCalledWith(['ctx-1', 'ctx-2'], PROJECT_ID);
    expect(contextAccessService.updateMember).toHaveBeenCalledWith('user-2', PROJECT_ID, {
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['ctx-1', 'ctx-2'],
    });
    expect(result.roleScope).toBe(RoleScope.SELECTED_CONTEXTS);
    expect(result.contextIds).toEqual(['ctx-1', 'ctx-2']);
  });

  it('admin role overrides explicit roleScope + contextIds — response reflects persisted (entire_project, [])', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'adm-1',
    });

    const result = await service.run(
      command({
        role: ProjectRole.ADMIN,
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
      })
    );

    expect(contextAccessService.updateMember).toHaveBeenCalledWith('adm-1', PROJECT_ID, {
      role: ProjectRole.ADMIN,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: ['ctx-1'],
    });
    // Response must NOT echo the input — admin coerces to entire_project + [].
    expect(result).toEqual({
      userId: 'adm-1',
      role: ProjectRole.ADMIN,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });
  });

  it('non-admin + explicit selected_contexts + 0 contexts → valid no-shared-access state', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'user-3',
    });

    await service.run(
      command({
        role: ProjectRole.EDITOR,
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: [],
      })
    );

    expect(contextAccessService.updateMember).toHaveBeenCalledWith('user-3', PROJECT_ID, {
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: [],
    });
  });

  it('IDP failure propagates and skips local writes', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockRejectedValue(new Error('IDP refused'));

    await expect(service.run(command())).rejects.toThrow('IDP refused');
    expect(contextAccessService.updateMember).not.toHaveBeenCalled();
  });

  it('IDP 404 → NotFoundException (matches Swagger spec, not generic 500)', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    const notFound = Object.assign(new Error('Upstream resource not found'), {
      name: 'IdpNotFoundException',
      status: 404,
    });
    idpProjectionsFacade.approveMembershipRequest.mockRejectedValue(notFound);

    await expect(service.run(command())).rejects.toBeInstanceOf(NotFoundException);
    expect(contextAccessService.updateMember).not.toHaveBeenCalled();
  });

  it('ContextAccessService failure after IDP success → wraps to actionable partial-failure error', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'user-4',
    });
    const dbBlip = new Error('DB blip');
    contextAccessService.updateMember.mockRejectedValue(dbBlip);

    await expect(service.run(command({ role: ProjectRole.EDITOR }))).rejects.toThrow(
      LOCAL_MEMBER_SCOPE_PARTIAL_FAILURE_MESSAGE
    );
    // The wrapper is the documented client-facing exception, not a bare
    // 500. The original error is preserved on `cause` for postmortems.
    let captured: unknown;
    try {
      await service.run(command({ role: ProjectRole.EDITOR }));
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(InternalServerErrorException);
    expect((captured as { cause?: unknown }).cause).toBe(dbBlip);
    // Half-state recovery: getRoleScope/getMemberContextIds must NOT be
    // called on the failure path — the saga unwinds before read-back.
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(contextAccessService.getMemberContextIds).not.toHaveBeenCalled();
  });

  it('explicit roleScope=entire_project + contextIds → honours explicit scope, still records contexts', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'wide-1',
    });

    await service.run(
      command({
        role: ProjectRole.VIEWER,
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: ['ctx-1'],
      })
    );

    expect(contextAccessService.updateMember).toHaveBeenCalledWith('wide-1', PROJECT_ID, {
      role: ProjectRole.VIEWER,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: ['ctx-1'],
    });
  });

  it('response reflects persisted state — read-back from ContextAccessService, not input echo', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({ userId: 'user-5' });
    // Simulate a downstream coercion the service is unaware of (e.g. a
    // future ContextAccessService rule that pins editor to a default ctx).
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    contextAccessService.getMemberContextIds.mockResolvedValue(['ctx-default']);

    const result = await service.run(command({ role: ProjectRole.EDITOR }));

    expect(result.roleScope).toBe(RoleScope.SELECTED_CONTEXTS);
    expect(result.contextIds).toEqual(['ctx-default']);
  });
});
