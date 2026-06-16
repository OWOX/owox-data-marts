import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpProjectContextFacade } from '../../../idp/facades/mcp-project-context.facade';
import { GetProjectContextTool } from './project-context.tool';

describe('GetProjectContextTool', () => {
  const context: McpAuthContext = {
    clientId: 'mcp-client-1',
    userId: 'user-1',
    projectId: 'project-1',
    roles: ['viewer'],
    resource: 'https://mcp.owox.com/mcp',
    scopes: ['mcp:read'],
    authFlow: 'mcp',
  };

  it('returns current MCP project context and switching guidance', async () => {
    const projectContext = {
      getProjectContext: jest.fn().mockResolvedValue({
        project: {
          id: 'project-1',
          title: 'Main Project',
          status: 'active',
          roles: ['admin'],
          createdAt: '2026-06-01 12:30:45',
        },
      }),
    } as unknown as jest.Mocked<McpProjectContextFacade>;
    const tool = new GetProjectContextTool(projectContext);

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent: {
        current_project: {
          id: 'project-1',
          title: 'Main Project',
          status: 'active',
          roles: ['admin'],
          created_at: '2026-06-01 12:30:45',
        },
        project_switching:
          'To use another OWOX project, disconnect and reconnect this MCP server, then sign in again and choose the desired project during OWOX authorization.',
      },
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              current_project: {
                id: 'project-1',
                title: 'Main Project',
                status: 'active',
                roles: ['admin'],
                created_at: '2026-06-01 12:30:45',
              },
              project_switching:
                'To use another OWOX project, disconnect and reconnect this MCP server, then sign in again and choose the desired project during OWOX authorization.',
            },
            null,
            2
          ),
        },
      ],
    });
    expect(projectContext.getProjectContext).toHaveBeenCalledWith({
      userId: 'user-1',
      projectId: 'project-1',
      roles: ['viewer'],
    });
  });

  it('rejects explicit project_id input', () => {
    const tool = new GetProjectContextTool({} as McpProjectContextFacade);

    expect(() => tool.parseInput({ project_id: 'project-2' })).toThrow();
  });

  it('describes when to use it and how to explain project switching', () => {
    const tool = new GetProjectContextTool({} as McpProjectContextFacade);

    expect(tool).toMatchObject({
      name: 'get_project_context',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        current_project: expect.any(Object),
        project_switching: expect.any(Object),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('current OWOX project');
    expect(tool.description).toContain('disconnect and reconnect');
    expect(tool.description).toContain('choose the desired project');
  });
});
