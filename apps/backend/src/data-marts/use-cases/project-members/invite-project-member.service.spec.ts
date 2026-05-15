import { InternalServerErrorException } from '@nestjs/common';
import { InviteProjectMemberCommand } from '../../dto/domain/invite-project-member.command';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { InviteProjectMemberService } from './invite-project-member.service';
import { LOCAL_MEMBER_SCOPE_PARTIAL_FAILURE_MESSAGE } from './util/member-scope-saga.util';

describe('InviteProjectMemberService', () => {
  const PROJECT_ID = 'project-1';
  const ACTOR_ID = 'admin-1';

  const createService = () => {
    const idpProjectionsFacade = {
      inviteMember: jest.fn(),
    };
    const contextAccessService = {
      updateMember: jest.fn().mockResolvedValue(undefined),
    };
    const contextService = {
      validateContextIds: jest.fn().mockResolvedValue(undefined),
    };
    const service = new InviteProjectMemberService(
      idpProjectionsFacade as never,
      contextAccessService as never,
      contextService as never
    );
    return { service, idpProjectionsFacade, contextAccessService, contextService };
  };

  const command = (
    overrides: Partial<InviteProjectMemberCommand> = {}
  ): InviteProjectMemberCommand =>
    new InviteProjectMemberCommand(
      overrides.projectId ?? PROJECT_ID,
      overrides.actorUserId ?? ACTOR_ID,
      overrides.email ?? 'invitee@test.io',
      overrides.role ?? ProjectRole.EDITOR,
      overrides.roleScope,
      overrides.contextIds ?? []
    );

  it('non-admin without contextIds and without explicit roleScope → defaults to entire_project', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.inviteMember.mockResolvedValue({
      projectId: PROJECT_ID,
      email: 'invitee@test.io',
      role: ProjectRole.EDITOR,
      kind: 'magic-link',
      magicLink: 'https://app/invite/tok',
      userId: 'new-user',
    });

    await service.run(command({ role: ProjectRole.EDITOR, contextIds: [] }));

    expect(contextAccessService.updateMember).toHaveBeenCalledWith('new-user', PROJECT_ID, {
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: [],
    });
  });

  it('non-admin + explicit selected_contexts + 0 contexts → valid no-shared-access state per Fibery spec', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.inviteMember.mockResolvedValue({
      projectId: PROJECT_ID,
      email: 'scoped@test.io',
      role: ProjectRole.EDITOR,
      kind: 'magic-link',
      magicLink: 'https://app/invite/scoped',
      userId: 'scoped-user',
    });

    await service.run(
      command({
        role: ProjectRole.EDITOR,
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: [],
      })
    );

    expect(idpProjectionsFacade.inviteMember).toHaveBeenCalled();
    expect(contextAccessService.updateMember).toHaveBeenCalledWith('scoped-user', PROJECT_ID, {
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: [],
    });
  });

  it('non-admin + contextIds → defaults to selected_contexts, validates context ids, applies scope', async () => {
    const { service, idpProjectionsFacade, contextAccessService, contextService } = createService();
    idpProjectionsFacade.inviteMember.mockResolvedValue({
      projectId: PROJECT_ID,
      email: 'invitee@test.io',
      role: ProjectRole.EDITOR,
      kind: 'magic-link',
      magicLink: 'https://app/invite/tok',
      userId: 'new-user',
    });

    const result = await service.run(
      command({ role: ProjectRole.EDITOR, contextIds: ['ctx-1', 'ctx-2'] })
    );

    expect(contextService.validateContextIds).toHaveBeenCalledWith(['ctx-1', 'ctx-2'], PROJECT_ID);
    expect(idpProjectionsFacade.inviteMember).toHaveBeenCalledWith(
      PROJECT_ID,
      'invitee@test.io',
      'editor',
      ACTOR_ID
    );
    expect(contextAccessService.updateMember).toHaveBeenCalledWith('new-user', PROJECT_ID, {
      role: ProjectRole.EDITOR,
      roleScope: RoleScope.SELECTED_CONTEXTS,
      contextIds: ['ctx-1', 'ctx-2'],
    });
    expect(result.kind).toBe('magic-link');
  });

  it('admin role overrides explicit roleScope to entire_project', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.inviteMember.mockResolvedValue({
      projectId: PROJECT_ID,
      email: 'adm@test.io',
      role: ProjectRole.ADMIN,
      kind: 'magic-link',
      magicLink: 'https://app/invite/adm',
      userId: 'adm-stub',
    });

    await service.run(
      command({
        role: ProjectRole.ADMIN,
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['ctx-1'],
      })
    );

    expect(contextAccessService.updateMember).toHaveBeenCalledWith('adm-stub', PROJECT_ID, {
      role: ProjectRole.ADMIN,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: ['ctx-1'],
    });
  });

  it('explicit roleScope=entire_project + contextIds → honours explicit scope, still records contexts', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.inviteMember.mockResolvedValue({
      projectId: PROJECT_ID,
      email: 'wide@test.io',
      role: ProjectRole.VIEWER,
      kind: 'magic-link',
      magicLink: 'https://app/invite/wide',
      userId: 'wide-stub',
    });

    await service.run(
      command({
        role: ProjectRole.VIEWER,
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: ['ctx-1'],
      })
    );

    expect(contextAccessService.updateMember).toHaveBeenCalledWith('wide-stub', PROJECT_ID, {
      role: ProjectRole.VIEWER,
      roleScope: RoleScope.ENTIRE_PROJECT,
      contextIds: ['ctx-1'],
    });
  });

  it('no userId from IDP → does not touch local bindings (deferred to first sign-in)', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.inviteMember.mockResolvedValue({
      projectId: PROJECT_ID,
      email: 'deferred@test.io',
      role: ProjectRole.VIEWER,
      kind: 'email-sent',
      message: 'Invitation email sent',
    });

    await service.run(
      command({
        role: ProjectRole.VIEWER,
        roleScope: RoleScope.ENTIRE_PROJECT,
        contextIds: [],
      })
    );

    expect(contextAccessService.updateMember).not.toHaveBeenCalled();
  });

  it('IDP failure propagates — no local writes attempted', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.inviteMember.mockRejectedValue(new Error('IDP refused'));

    await expect(
      service.run(
        command({
          role: ProjectRole.VIEWER,
          roleScope: RoleScope.ENTIRE_PROJECT,
          contextIds: [],
        })
      )
    ).rejects.toThrow('IDP refused');

    expect(contextAccessService.updateMember).not.toHaveBeenCalled();
  });

  it('local write fails after IDP success → wraps to actionable partial-failure error', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.inviteMember.mockResolvedValue({
      projectId: PROJECT_ID,
      email: 'local-fail@test.io',
      role: ProjectRole.EDITOR,
      kind: 'magic-link',
      magicLink: 'https://app/invite/local-fail',
      userId: 'local-fail-stub',
    });
    const dbBlip = new Error('DB blip');
    contextAccessService.updateMember.mockRejectedValue(dbBlip);

    let captured: unknown;
    try {
      await service.run(
        command({
          role: ProjectRole.EDITOR,
          roleScope: RoleScope.ENTIRE_PROJECT,
          contextIds: [],
        })
      );
    } catch (err) {
      captured = err;
    }
    expect(captured).toBeInstanceOf(InternalServerErrorException);
    expect((captured as Error).message).toBe(LOCAL_MEMBER_SCOPE_PARTIAL_FAILURE_MESSAGE);
    expect((captured as { cause?: unknown }).cause).toBe(dbBlip);
  });
});
