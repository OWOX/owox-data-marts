import { ListProjectMembersCommand } from '../../dto/domain/list-project-members.command';
import { RoleScope } from '../../enums/role-scope.enum';
import { ListProjectMembersService } from './list-project-members.service';

describe('ListProjectMembersService', () => {
  const PROJECT_ID = 'project-1';

  const createService = () => {
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
      getProjectMembersOrThrow: jest.fn(),
    };
    const contextAccessService = {
      getRoleScope: jest.fn(),
      getMemberContextIds: jest.fn(),
    };
    const service = new ListProjectMembersService(
      idpProjectionsFacade as never,
      contextAccessService as never
    );
    return { service, idpProjectionsFacade, contextAccessService };
  };

  it('enriches each project member with their roleScope and contextIds', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
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

    const result = await service.run(new ListProjectMembersCommand(PROJECT_ID));

    expect(idpProjectionsFacade.getProjectMembers).toHaveBeenCalledWith(PROJECT_ID);
    for (const userId of ['u1', 'u2']) {
      expect(contextAccessService.getRoleScope).toHaveBeenCalledWith(userId, PROJECT_ID);
      expect(contextAccessService.getMemberContextIds).toHaveBeenCalledWith(userId, PROJECT_ID);
    }
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

  it('does not list or load access scopes for outbound members', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      { userId: 'removed', isOutbound: true },
    ]);
    await expect(service.run(new ListProjectMembersCommand(PROJECT_ID))).resolves.toEqual([]);
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    expect(contextAccessService.getMemberContextIds).not.toHaveBeenCalled();
  });

  it('can require membership lookup errors to propagate instead of using the display fallback', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembersOrThrow.mockRejectedValue(new Error('IDP unavailable'));
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([]);
    await expect(service.run(new ListProjectMembersCommand(PROJECT_ID, true))).rejects.toThrow(
      'IDP unavailable'
    );
    expect(contextAccessService.getRoleScope).not.toHaveBeenCalled();
    await expect(service.run(new ListProjectMembersCommand(PROJECT_ID))).resolves.toEqual([]);
  });

  it('returns empty list when project has no members', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([]);

    const result = await service.run(new ListProjectMembersCommand(PROJECT_ID));

    expect(result).toEqual([]);
  });

  it('loads member scopes sequentially to avoid concurrent SQLite transactions', async () => {
    const { service, idpProjectionsFacade, contextAccessService } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([
      {
        userId: 'u1',
        email: 'u1@test.io',
        displayName: undefined,
        avatarUrl: undefined,
        role: 'viewer',
      },
      {
        userId: 'u2',
        email: 'u2@test.io',
        displayName: undefined,
        avatarUrl: undefined,
        role: 'viewer',
      },
    ]);

    let activeReads = 0;
    let maxConcurrentReads = 0;
    const read = async <T>(value: T): Promise<T> => {
      activeReads++;
      maxConcurrentReads = Math.max(maxConcurrentReads, activeReads);
      await Promise.resolve();
      activeReads--;
      return value;
    };
    contextAccessService.getRoleScope.mockImplementation(() => read(RoleScope.ENTIRE_PROJECT));
    contextAccessService.getMemberContextIds.mockImplementation(() => read([]));

    await service.run(new ListProjectMembersCommand(PROJECT_ID));

    expect(maxConcurrentReads).toBe(1);
  });
});
