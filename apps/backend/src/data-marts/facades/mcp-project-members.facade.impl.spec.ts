import { ForbiddenException } from '@nestjs/common';
import type { IdpProjectionsFacade } from '../../idp/facades/idp-projections.facade';
import type { ContextAccessService } from '../services/context/context-access.service';
import { ListProjectMembersService } from '../use-cases/project-members/list-project-members.service';
import { McpProjectMembersFacadeImpl } from './mcp-project-members.facade.impl';
import { ProjectRole, RoleScope } from './mcp-project-members.facade';

describe('McpProjectMembersFacadeImpl', () => {
  const createFacade = () => {
    const idp = {
      getProjectMembers: jest.fn().mockResolvedValue([
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

  it.each(['viewer', 'editor', 'admin'])(
    'allows %s just like the members API and preserves scope enrichment',
    async role => {
      const { facade, idp, access } = createFacade();
      expect(
        await facade.listProjectMembers({
          projectId: 'project-1',
          userId: 'actor-1',
          roles: [role],
        })
      ).toEqual([
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
      expect(idp.getProjectMembers).toHaveBeenCalledWith('project-1');
      expect(access.getRoleScope).toHaveBeenCalledWith('member-1', 'project-1');
      expect(access.getMemberContextIds).toHaveBeenCalledWith('member-1', 'project-1');
    }
  );

  it.each([
    { projectId: '', userId: 'actor-1', roles: ['admin'] },
    { projectId: 'project-1', userId: '', roles: ['admin'] },
    { projectId: 'project-1', userId: ' ', roles: ['admin'] },
    { projectId: 'project-1', userId: 'actor-1', roles: [] },
    { projectId: 'project-1', userId: 'actor-1', roles: ['unknown'] },
  ])('rejects an invalid actor or project before reading memberships: %j', async ctx => {
    const { facade, idp } = createFacade();
    await expect(facade.listProjectMembers(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(idp.getProjectMembers).not.toHaveBeenCalled();
  });

  it('propagates member-scope lookup errors instead of reporting an empty project', async () => {
    const { facade, access } = createFacade();
    access.getRoleScope.mockRejectedValue(new Error('Scope lookup unavailable'));
    await expect(
      facade.listProjectMembers({ projectId: 'project-1', userId: 'actor-1', roles: ['viewer'] })
    ).rejects.toThrow('Scope lookup unavailable');
  });
});
