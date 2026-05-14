import { ApproveMembershipRequestCommand } from '../../dto/domain/approve-membership-request.command';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ApproveMembershipRequestService } from './approve-membership-request.service';

describe('ApproveMembershipRequestService', () => {
  const PROJECT_ID = 'project-1';
  const ACTOR_ID = 'admin-1';
  const REQUEST_ID = 'req-1';

  const createService = () => {
    const idpProjectionsFacade = {
      approveMembershipRequest: jest.fn(),
    };
    const contextAccessService = {
      updateMember: jest.fn().mockResolvedValue(undefined),
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
    expect(result.userId).toBe('user-1');
  });

  it('non-admin + contextIds → defaults to selected_contexts and validates ids', async () => {
    const { service, idpProjectionsFacade, contextAccessService, contextService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'user-2',
    });

    await service.run(command({ role: ProjectRole.EDITOR, contextIds: ['ctx-1', 'ctx-2'] }));

    expect(contextService.validateContextIds).toHaveBeenCalledWith(['ctx-1', 'ctx-2'], PROJECT_ID);
    expect(contextAccessService.updateMember).toHaveBeenCalledWith('user-2', PROJECT_ID, {
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['ctx-1', 'ctx-2'],
    });
  });

  it('admin role overrides explicit roleScope to entire_project', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'adm-1',
    });

    await service.run(
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

  it('ContextAccessService failure after IDP success → error propagates (no silent fallback)', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.approveMembershipRequest.mockResolvedValue({
      userId: 'user-4',
    });
    contextAccessService.updateMember.mockRejectedValue(new Error('DB blip'));

    await expect(service.run(command({ role: ProjectRole.EDITOR }))).rejects.toThrow('DB blip');
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
});
