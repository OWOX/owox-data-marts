import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateProjectMemberCommand } from '../../dto/domain/update-project-member.command';
import { ProjectRole } from '../../enums/project-role.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { UpdateProjectMemberService } from './update-project-member.service';

class IdpNotFoundException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'IdpNotFoundException';
  }
}

describe('UpdateProjectMemberService', () => {
  const PROJECT_ID = 'project-1';
  const ACTOR_ID = 'admin-1';
  const TARGET_ID = 'user-2';

  const createService = () => {
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
      // Mirror the facade's real getProjectMember(): linear scan over
      // getProjectMembers() so tests only need to set the list mock.
      getProjectMember: jest.fn(async (projectId: string, userId: string) => {
        const list = await idpProjectionsFacade.getProjectMembers(projectId);
        return Array.isArray(list) ? list.find(m => m.userId === userId) : undefined;
      }),
      changeMemberRole: jest.fn(),
    };
    const contextAccessService = {
      updateMember: jest.fn().mockResolvedValue(undefined),
      getRoleScope: jest.fn(),
      getMemberContextIds: jest.fn(),
    };
    const contextService = {
      validateContextIds: jest.fn().mockResolvedValue(undefined),
    };
    const service = new UpdateProjectMemberService(
      idpProjectionsFacade as never,
      contextAccessService as never,
      contextService as never
    );
    return { service, idpProjectionsFacade, contextAccessService, contextService };
  };

  const command = (
    overrides: Partial<UpdateProjectMemberCommand> = {}
  ): UpdateProjectMemberCommand =>
    new UpdateProjectMemberCommand(
      overrides.projectId ?? PROJECT_ID,
      overrides.actorUserId ?? ACTOR_ID,
      overrides.targetUserId ?? TARGET_ID,
      overrides.role ?? ProjectRole.EDITOR,
      overrides.roleScope ?? RoleScope.SELECTED_CONTEXTS,
      overrides.contextIds ?? ['ctx-1']
    );

  it('rejects self-modification with 403 before contacting IDP or local store', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();

    await expect(
      service.run(command({ actorUserId: 'same', targetUserId: 'same' }))
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(idpProjectionsFacade.getProjectMembers).not.toHaveBeenCalled();
    expect(contextAccessService.updateMember).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when target member is not in the project', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'someone-else', role: ProjectRole.VIEWER },
    ]);

    await expect(service.run(command())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('invalid context id → BadRequest before IDP role change is committed', async () => {
    const { service, idpProjectionsFacade, contextService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: ProjectRole.VIEWER },
    ]);
    contextService.validateContextIds.mockRejectedValue(
      new BadRequestException('One or more context IDs are invalid')
    );

    await expect(
      service.run(command({ role: ProjectRole.EDITOR, contextIds: ['ctx-bad'] }))
    ).rejects.toBeInstanceOf(BadRequestException);

    // IDP must NOT be touched on a bad contextId — otherwise the role would
    // change in the IDP while local scope/contexts stay unchanged.
    expect(idpProjectionsFacade.changeMemberRole).not.toHaveBeenCalled();
  });

  it('same role — does not call IDP, persists scope/contexts, returns ok', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: ProjectRole.EDITOR },
    ]);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    contextAccessService.getMemberContextIds.mockResolvedValue(['ctx-1']);

    const result = await service.run(command({ role: ProjectRole.EDITOR }));

    expect(idpProjectionsFacade.changeMemberRole).not.toHaveBeenCalled();
    expect(contextAccessService.updateMember).toHaveBeenCalled();
    expect(result.role).toBe('editor');
    expect(result.roleScope).toBe(RoleScope.SELECTED_CONTEXTS);
  });

  it('different role — calls IDP changeMemberRole before touching local scope', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: ProjectRole.VIEWER },
    ]);
    contextAccessService.getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
    contextAccessService.getMemberContextIds.mockResolvedValue(['ctx-1']);

    const order: string[] = [];
    idpProjectionsFacade.changeMemberRole.mockImplementation(async () => {
      order.push('idp');
    });
    contextAccessService.updateMember.mockImplementation(async () => {
      order.push('local');
    });

    await service.run(command({ role: ProjectRole.EDITOR }));

    expect(order).toEqual(['idp', 'local']);
    expect(idpProjectionsFacade.changeMemberRole).toHaveBeenCalledWith(
      PROJECT_ID,
      TARGET_ID,
      'editor',
      ACTOR_ID
    );
  });

  it('IDP failure on role change propagates without touching local scope', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: ProjectRole.VIEWER },
    ]);
    idpProjectionsFacade.changeMemberRole.mockRejectedValue(new Error('IDP refused'));

    await expect(service.run(command({ role: ProjectRole.EDITOR }))).rejects.toThrow('IDP refused');

    expect(contextAccessService.updateMember).not.toHaveBeenCalled();
  });

  it('upstream 404 on changeMemberRole maps to NestJS NotFoundException', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: ProjectRole.VIEWER },
    ]);
    idpProjectionsFacade.changeMemberRole.mockRejectedValue(new IdpNotFoundException('not found'));

    await expect(service.run(command({ role: ProjectRole.EDITOR }))).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
