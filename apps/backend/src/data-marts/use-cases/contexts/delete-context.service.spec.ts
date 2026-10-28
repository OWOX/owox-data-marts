import { DeleteContextService } from './delete-context.service';
import { DeleteContextCommand } from '../../dto/domain/delete-context.command';

describe('DeleteContextService', () => {
  const PROJECT_ID = 'project-1';
  const CONTEXT_ID = 'ctx-1';

  const createService = () => {
    const contexts = { delete: jest.fn().mockResolvedValue(undefined) };
    const idpProjectionsFacade = { getProjectMembersOrThrow: jest.fn() };
    const service = new DeleteContextService(contexts as never, idpProjectionsFacade as never);
    return { service, contexts, idpProjectionsFacade };
  };

  it('passes only current non-admin members, so admins and former members never block', async () => {
    const { service, contexts, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockResolvedValue([
      { userId: 'admin-1', role: 'admin', isOutbound: false },
      { userId: 'editor-1', role: 'editor', isOutbound: false },
      { userId: 'viewer-1', role: 'viewer', isOutbound: false },
      { userId: 'gone-1', role: 'editor', isOutbound: true },
    ]);

    await service.run(new DeleteContextCommand(CONTEXT_ID, PROJECT_ID));

    expect(idpProjectionsFacade.getProjectMembersOrThrow).toHaveBeenCalledWith(PROJECT_ID);
    expect(contexts.delete).toHaveBeenCalledWith(
      CONTEXT_ID,
      PROJECT_ID,
      new Set(['editor-1', 'viewer-1'])
    );
  });

  it('does not delete when project members cannot be loaded', async () => {
    const { service, contexts, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockRejectedValue(
      new Error('Project membership is unavailable')
    );

    await expect(service.run(new DeleteContextCommand(CONTEXT_ID, PROJECT_ID))).rejects.toThrow(
      'Project membership is unavailable'
    );
    expect(contexts.delete).not.toHaveBeenCalled();
  });
});
