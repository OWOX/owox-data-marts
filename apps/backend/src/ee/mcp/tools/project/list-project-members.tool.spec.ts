import { z } from 'zod-v4';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import type { McpProjectMembersFacade } from '../../../../data-marts/facades/mcp-project-members.facade';
import { ListProjectMembersTool } from './list-project-members.tool';

describe('ListProjectMembersTool', () => {
  const context: McpAuthContext = {
    clientId: 'client-1',
    projectId: 'project-1',
    userId: 'actor-1',
    roles: ['viewer'],
    scopes: ['mcp:read'],
    resource: 'https://mcp.example/mcp',
    authFlow: 'mcp',
  };

  it('returns assignment IDs and identity metadata from the connected project', async () => {
    const facade = {
      listProjectMembers: jest.fn().mockResolvedValue([
        {
          userId: 'member-1',
          email: 'analyst@example.test',
          displayName: 'Analyst',
          role: 'editor',
          roleScope: 'selected_contexts',
          contextIds: ['context-1'],
          internalToken: 'not-for-mcp',
        },
      ]),
    };
    const tool = new ListProjectMembersTool(facade as unknown as McpProjectMembersFacade);
    const result = await tool.handler({}, context);
    const expected = {
      members: [
        {
          user_id: 'member-1',
          email: 'analyst@example.test',
          display_name: 'Analyst',
          avatar_url: null,
          role: 'editor',
          role_scope: 'selected_contexts',
          context_ids: ['context-1'],
        },
      ],
    };
    expect(result).toEqual({
      structuredContent: expected,
      content: [{ type: 'text', text: JSON.stringify(expected, null, 2) }],
    });
    expect(z.object(tool.outputSchema).parse(result.structuredContent)).toEqual(expected);
    expect(facade.listProjectMembers).toHaveBeenCalledWith('project-1');
  });

  it('normalizes missing names and avatars without inventing identities', async () => {
    const facade = {
      listProjectMembers: jest.fn().mockResolvedValue([
        {
          userId: 'member-2',
          email: 'user@example.test',
          role: 'viewer',
          roleScope: 'entire_project',
          contextIds: [],
        },
      ]),
    };
    const tool = new ListProjectMembersTool(facade as unknown as McpProjectMembersFacade);
    expect((await tool.handler({}, context)).structuredContent).toEqual({
      members: [
        {
          user_id: 'member-2',
          email: 'user@example.test',
          display_name: null,
          avatar_url: null,
          role: 'viewer',
          role_scope: 'entire_project',
          context_ids: [],
        },
      ],
    });
    expect(tool.requiredScopes).toEqual(['mcp:read']);
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  });

  it.each(['project_id', 'user_id', 'roles'])(
    'rejects a caller-supplied %s on direct handler calls',
    async field => {
      const facade = { listProjectMembers: jest.fn() };
      const tool = new ListProjectMembersTool(facade as unknown as McpProjectMembersFacade);
      await expect(tool.handler({ [field]: 'override' } as never, context)).rejects.toThrow(
        z.ZodError
      );
      expect(facade.listProjectMembers).not.toHaveBeenCalled();
    }
  );

  it('returns an empty members list when the API use case has no members', async () => {
    const tool = new ListProjectMembersTool({
      listProjectMembers: jest.fn().mockResolvedValue([]),
    });
    expect((await tool.handler({}, context)).structuredContent).toEqual({ members: [] });
  });
});
