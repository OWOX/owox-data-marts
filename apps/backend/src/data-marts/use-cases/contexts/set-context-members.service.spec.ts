import { BadRequestException } from '@nestjs/common';
import { SetContextMembersService } from './set-context-members.service';

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
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([
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
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([]);

    const result = await service.run(CONTEXT_ID, PROJECT_ID, []);

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
      service.run(CONTEXT_ID, PROJECT_ID, ['editor-1', 'ghost-1', 'ghost-2'])
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(contextAccessService.setContextMembers).not.toHaveBeenCalled();
  });

  it('propagates IDP-outage errors instead of degrading to admin-strip miss', async () => {
    // Documents the H2 fix: an IDP failure here used to be swallowed and
    // returned as `[]`, letting admin user-ids slip past the admin filter.
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockRejectedValue(new Error('IDP unreachable'));

    await expect(service.run(CONTEXT_ID, PROJECT_ID, ['someone'])).rejects.toThrow(
      'IDP unreachable'
    );

    expect(contextAccessService.setContextMembers).not.toHaveBeenCalled();
  });
});
