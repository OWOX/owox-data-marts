import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpProjectContextFacade } from '../../../idp/facades/mcp-project-context.facade';
import type { ProjectSettingsFacade } from '../../../project-settings/facades/project-settings.facade';
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
    const projectSettings = {
      getDescription: jest.fn().mockResolvedValue('Revenue means net revenue after refunds.'),
    } as unknown as jest.Mocked<ProjectSettingsFacade>;
    const tool = new GetProjectContextTool(projectContext, projectSettings);

    await expect(tool.handler({}, context)).resolves.toEqual({
      structuredContent: {
        current_project: {
          id: 'project-1',
          title: 'Main Project',
          description: 'Revenue means net revenue after refunds.',
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
                description: 'Revenue means net revenue after refunds.',
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
    expect(projectSettings.getDescription).toHaveBeenCalledWith('project-1');
  });

  it('returns a 10,000-character project description without truncation', async () => {
    const description = `START:${'x'.repeat(9_990)}:END`;
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
    const projectSettings = {
      getDescription: jest.fn().mockResolvedValue(description),
    } as unknown as jest.Mocked<ProjectSettingsFacade>;
    const tool = new GetProjectContextTool(projectContext, projectSettings);

    const result = await tool.handler({}, context);
    const structuredContent = result.structuredContent as {
      current_project: { description: string | null };
    };
    const textContent = result.content[0];

    expect(description).toHaveLength(10_000);
    expect(structuredContent.current_project.description).toBe(description);
    expect(textContent.type).toBe('text');
    if (textContent.type !== 'text') {
      throw new Error('Expected JSON text content');
    }
    expect(JSON.parse(textContent.text)).toMatchObject({
      current_project: { description },
    });
  });

  it('returns null when no project description is configured', async () => {
    const projectContext = {
      getProjectContext: jest.fn().mockResolvedValue({
        project: {
          id: 'project-1',
          title: 'Main Project',
          status: null,
          roles: ['viewer'],
          createdAt: null,
        },
      }),
    } as unknown as jest.Mocked<McpProjectContextFacade>;
    const projectSettings = {
      getDescription: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<ProjectSettingsFacade>;
    const tool = new GetProjectContextTool(projectContext, projectSettings);

    const result = await tool.handler({}, context);
    const structuredContent = result.structuredContent as {
      current_project: { description: string | null };
    };

    expect(structuredContent.current_project.description).toBeNull();
  });

  it('returns project context with a null description when loading the description fails', async () => {
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
    const projectSettings = {
      getDescription: jest.fn().mockRejectedValue(new Error('Project settings unavailable')),
    } as unknown as jest.Mocked<ProjectSettingsFacade>;
    const tool = new GetProjectContextTool(projectContext, projectSettings);

    const result = await tool.handler({}, context);

    expect(result.structuredContent).toMatchObject({
      current_project: {
        id: 'project-1',
        title: 'Main Project',
        description: null,
        status: 'active',
        roles: ['admin'],
        created_at: '2026-06-01 12:30:45',
      },
    });
  });

  it('rejects explicit project_id input', () => {
    const tool = new GetProjectContextTool(
      {} as McpProjectContextFacade,
      {} as ProjectSettingsFacade
    );

    expect(() => tool.parseInput({ project_id: 'project-2' })).toThrow();
  });

  it('describes when to use it and how to explain project switching', () => {
    const tool = new GetProjectContextTool(
      {} as McpProjectContextFacade,
      {} as ProjectSettingsFacade
    );

    expect(tool).toMatchObject({
      name: 'get_project_context',
      requiredScopes: ['mcp:read'],
      outputSchema: expect.objectContaining({
        current_project: expect.any(Object),
        project_switching: expect.any(Object),
      }),
      annotations: {
        title: 'Get Project Context',
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    });
    expect(tool.description).toContain('current OWOX project');
    expect(tool.description).toContain('complete admin-maintained project description');
    expect(tool.description).toContain('before the first project-specific operation');
    expect(tool.description).toContain('disconnect and reconnect');
    expect(tool.description).toContain('choose the desired project');
  });
});
