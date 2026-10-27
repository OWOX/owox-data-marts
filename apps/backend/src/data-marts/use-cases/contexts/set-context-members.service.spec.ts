import { BadRequestException } from '@nestjs/common';
import { SetContextMembersService } from './set-context-members.service';
import { SetContextMembersCommand } from '../../dto/domain/set-context-members.command';

describe('SetContextMembersService', () => {
  const PROJECT_ID = 'project-1';
  const CONTEXT_ID = 'ctx-1';

  const createService = () => {
    const idpProjectionsFacade = {
      getProjectMembersOrThrow: jest.fn(),
    };
    const contextAccessService = {
      setContextMembers: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SetContextMembersService(
      idpProjectionsFacade as never,
      contextAccessService as never
    );
    return { service, idpProjectionsFacade, contextAccessService };
  };

  it('strips admin user ids and reports them as droppedAdminIds', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'admin-1', role: 'admin' },
      { userId: 'editor-1', role: 'editor' },
      { userId: 'viewer-1', role: 'viewer' },
    ]);

    const result = await service.run(
      new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, ['admin-1', 'editor-1', 'viewer-1'])
    );

    expect(result.assignedUserIds).toEqual(['editor-1', 'viewer-1']);
    expect(result.droppedAdminIds).toEqual(['admin-1']);
    expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, [
      'editor-1',
      'viewer-1',
    ]);
  });

  it('forwards an unchanged list when no admins are in the input', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'editor-1', role: 'editor' },
    ]);

    const result = await service.run(
      new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, ['editor-1'])
    );

    expect(result.droppedAdminIds).toEqual([]);
    expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, [
      'editor-1',
    ]);
  });

  it('returns empty arrays when input is empty', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([]);

    const result = await service.run(new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, []));

    expect(result.assignedUserIds).toEqual([]);
    expect(result.droppedAdminIds).toEqual([]);
    expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, []);
  });

  it('throws BadRequestException listing the invalid ids when payload references non-members', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'editor-1', role: 'editor' },
    ]);

    await expect(
      service.run(
        new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, ['editor-1', 'ghost-1', 'ghost-2'])
      )
    ).rejects.toEqual(
      new BadRequestException('User IDs are not members of this project: ghost-1, ghost-2')
    );

    expect(contextAccessService.setContextMembers).not.toHaveBeenCalled();
  });

  it('rejects outbound members without changing assignments', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'former', role: 'editor', isOutbound: true },
    ]);
    await expect(
      service.run(new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, ['former']))
    ).rejects.toThrow('User IDs are not members of this project: former');
    expect(contextAccessService.setContextMembers).not.toHaveBeenCalled();
  });

  it('returns each assigned or dropped member once', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'admin', role: 'admin' },
      { userId: 'editor', role: 'editor' },
    ]);
    await expect(
      service.run(
        new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, ['admin', 'editor', 'admin', 'editor'])
      )
    ).resolves.toEqual({ assignedUserIds: ['editor'], droppedAdminIds: ['admin'] });
    expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, [
      'editor',
    ]);
  });

  it('does not change assignments when project membership cannot be loaded', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockRejectedValue(new Error('IDP unreachable'));

    await expect(
      service.run(new SetContextMembersCommand(CONTEXT_ID, PROJECT_ID, ['someone']))
    ).rejects.toThrow('IDP unreachable');

    expect(contextAccessService.setContextMembers).not.toHaveBeenCalled();
  });
});
