import { SetContextMembersService } from './set-context-members.service';

describe('SetContextMembersService', () => {
  const PROJECT_ID = 'project-1';
  const CONTEXT_ID = 'ctx-1';

  const createService = () => {
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
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
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'admin-1', role: 'admin' },
      { userId: 'editor-1', role: 'editor' },
      { userId: 'viewer-1', role: 'viewer' },
    ]);

    const result = await service.run(CONTEXT_ID, PROJECT_ID, ['admin-1', 'editor-1', 'viewer-1']);

    expect(result.assignedUserIds).toEqual(['editor-1', 'viewer-1']);
    expect(result.droppedAdminIds).toEqual(['admin-1']);
    expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, [
      'editor-1',
      'viewer-1',
    ]);
  });

  it('forwards an unchanged list when no admins are in the input', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'editor-1', role: 'editor' },
    ]);

    const result = await service.run(CONTEXT_ID, PROJECT_ID, ['editor-1']);

    expect(result.droppedAdminIds).toEqual([]);
    expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, [
      'editor-1',
    ]);
  });

  it('returns empty arrays when input is empty', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([]);

    const result = await service.run(CONTEXT_ID, PROJECT_ID, []);

    expect(result.assignedUserIds).toEqual([]);
    expect(result.droppedAdminIds).toEqual([]);
    expect(contextAccessService.setContextMembers).toHaveBeenCalledWith(CONTEXT_ID, PROJECT_ID, []);
  });
});
