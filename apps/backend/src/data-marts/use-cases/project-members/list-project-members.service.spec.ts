import { RoleScope } from '../../enums/role-scope.enum';
import { ListProjectMembersService } from './list-project-members.service';

describe('ListProjectMembersService', () => {
  const PROJECT_ID = 'project-1';

  const createService = () => {
    const idpProjectionsFacade = {
      getProjectMembers: jest.fn(),
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

    const result = await service.run(PROJECT_ID);

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

  it('returns empty list when project has no members', async () => {
    const { service, idpProjectionsFacade } = createService();
    idpProjectionsFacade.getProjectMembers.mockResolvedValue([]);

    const result = await service.run(PROJECT_ID);

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

    const calls: string[] = [];
    contextAccessService.getRoleScope.mockImplementation(async (userId: string) => {
      calls.push(`scope:${userId}`);
      return RoleScope.ENTIRE_PROJECT;
    });
    contextAccessService.getMemberContextIds.mockImplementation(async (userId: string) => {
      calls.push(`contexts:${userId}`);
      return [];
    });

    await service.run(PROJECT_ID);

    expect(calls).toEqual(['scope:u1', 'contexts:u1', 'scope:u2', 'contexts:u2']);
  });
});
