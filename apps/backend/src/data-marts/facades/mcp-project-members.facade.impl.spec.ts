import type { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import type { ContextAccessService } from '../services/context/context-access.service';
import { ListProjectMembersService } from '../use-cases/project-members/list-project-members.service';
import { McpProjectMembersFacadeImpl } from './mcp-project-members.facade.impl';
import { ProjectRole, RoleScope } from './mcp-project-members.facade';

describe('McpProjectMembersFacadeImpl', () => {
  const createFacade = () => {
    const idp = {
      getProjectMembersOrThrow: jest.fn().mockResolvedValue([
        {
          userId: 'member-1',
          email: 'analyst@example.test',
          displayName: 'Analyst',
          avatarUrl: undefined,
          role: 'editor',
        },
      ]),
    };
    const access = {
      getRoleScope: jest.fn().mockResolvedValue(RoleScope.SELECTED_CONTEXTS),
      getMemberContextIds: jest.fn().mockResolvedValue(['context-1']),
    };
    const service = new ListProjectMembersService(
      idp as unknown as IdpProjectionsFacade,
      access as unknown as ContextAccessService
    );
    return { facade: new McpProjectMembersFacadeImpl(service), idp, access };
  };

  it('reads the authenticated project members and preserves scope enrichment', async () => {
    const { facade, idp, access } = createFacade();
    expect(await facade.listProjectMembers('project-1')).toEqual([
      {
        userId: 'member-1',
        email: 'analyst@example.test',
        displayName: 'Analyst',
        avatarUrl: undefined,
        role: ProjectRole.EDITOR,
        roleScope: RoleScope.SELECTED_CONTEXTS,
        contextIds: ['context-1'],
      },
    ]);
    expect(idp.getProjectMembersOrThrow).toHaveBeenCalledWith('project-1');
    expect(access.getRoleScope).toHaveBeenCalledWith('member-1', 'project-1');
    expect(access.getMemberContextIds).toHaveBeenCalledWith('member-1', 'project-1');
  });

  it('propagates membership lookup failures before reading member scopes', async () => {
    const { facade, idp, access } = createFacade();
    idp.getProjectMembersOrThrow.mockRejectedValue(new Error('Project membership unavailable'));
    await expect(facade.listProjectMembers('project-1')).rejects.toThrow(
      'Project membership unavailable'
    );
    expect(access.getRoleScope).not.toHaveBeenCalled();
  });

  it('propagates member-scope lookup errors instead of reporting an empty project', async () => {
    const { facade, access } = createFacade();
    access.getRoleScope.mockRejectedValue(new Error('Scope lookup unavailable'));
    await expect(facade.listProjectMembers('project-1')).rejects.toThrow(
      'Scope lookup unavailable'
    );
  });
});
