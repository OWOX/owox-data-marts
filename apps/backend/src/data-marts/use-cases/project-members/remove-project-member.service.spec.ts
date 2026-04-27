import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RemoveProjectMemberCommand } from '../../dto/domain/remove-project-member.command';
import { RemoveProjectMemberService } from './remove-project-member.service';

class IdpNotFoundException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'IdpNotFoundException';
  }
}

describe('RemoveProjectMemberService', () => {
  const PROJECT_ID = 'project-1';
  const ACTOR_ID = 'admin-1';
  const TARGET_ID = 'user-2';

  const createService = () => {
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
      removeMember: jest.fn(),
    };
    const contextAccessService = {
      removeMemberBindings: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RemoveProjectMemberService(
      idpProjectionsFacade as never,
      contextAccessService as never
    );
    return { service, idpProjectionsFacade, contextAccessService };
  };

  const command = (
    overrides: Partial<RemoveProjectMemberCommand> = {}
  ): RemoveProjectMemberCommand =>
    new RemoveProjectMemberCommand(
      overrides.projectId ?? PROJECT_ID,
      overrides.actorUserId ?? ACTOR_ID,
      overrides.targetUserId ?? TARGET_ID
    );

  it('rejects self-removal with 403 before touching IDP or local store', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();

    await expect(
      service.run(command({ actorUserId: 'same', targetUserId: 'same' }))
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(idpProjectionsFacade.getProjectMembers).not.toHaveBeenCalled();
    expect(contextAccessService.removeMemberBindings).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when target member is not in the project', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'someone-else', role: 'viewer' },
    ]);

    await expect(service.run(command())).rejects.toBeInstanceOf(NotFoundException);

    expect(idpProjectionsFacade.removeMember).not.toHaveBeenCalled();
    expect(contextAccessService.removeMemberBindings).not.toHaveBeenCalled();
  });

  it('calls IDP removeMember then clears local bindings', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: 'viewer' },
    ]);
    idpProjectionsFacade.removeMember.mockResolvedValue(undefined);

    await service.run(command());

    expect(idpProjectionsFacade.removeMember).toHaveBeenCalledWith(PROJECT_ID, TARGET_ID, ACTOR_ID);
    expect(contextAccessService.removeMemberBindings).toHaveBeenCalledWith(TARGET_ID, PROJECT_ID);
  });

  it('non-404 IDP failure propagates without clearing local bindings', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: 'viewer' },
    ]);
    idpProjectionsFacade.removeMember.mockRejectedValue(new Error('IDP exploded'));

    await expect(service.run(command())).rejects.toThrow('IDP exploded');

    expect(contextAccessService.removeMemberBindings).not.toHaveBeenCalled();
  });

  it('treats upstream 404 as idempotent success and still clears local bindings', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: TARGET_ID, role: 'viewer' },
    ]);
    idpProjectionsFacade.removeMember.mockRejectedValue(new IdpNotFoundException('gone'));

    await expect(service.run(command())).resolves.toBeUndefined();

    expect(contextAccessService.removeMemberBindings).toHaveBeenCalledWith(TARGET_ID, PROJECT_ID);
  });
});
