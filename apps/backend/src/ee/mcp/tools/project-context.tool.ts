import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_PROJECT_CONTEXT_FACADE,
  type McpProjectContextFacade,
} from '../../../idp/facades/mcp-project-context.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';

type GetProjectContextInput = Record<string, never>;

@Injectable()
export class GetProjectContextTool implements McpToolDefinition<GetProjectContextInput> {
  readonly name = 'get_project_context';
  readonly description =
    'Returns the current OWOX project selected for this MCP connection, including id, title, roles, status, and creation date. Use this tool when the user asks which project is current, active, selected, or connected. If the user asks how to change or switch projects, explain that project selection happens during OWOX authorization: disconnect and reconnect this MCP server, then sign in again and choose the desired project.';
  readonly zodSchema = {};
  readonly outputSchema = {
    current_project: z.object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
      roles: z.array(z.string()),
      created_at: z.string(),
    }),
    project_switching: z.string(),
  };
  readonly annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  private readonly inputSchema = z.object({}).strict();

  constructor(
    @Inject(MCP_PROJECT_CONTEXT_FACADE)
    private readonly projectContext: McpProjectContextFacade
  ) {}

  parseInput(input: unknown): GetProjectContextInput {
    return this.inputSchema.parse(input);
  }

  async handler(input: GetProjectContextInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);

    const result = await this.projectContext.getProjectContext({
      userId: context.userId,
      projectId: context.projectId,
      roles: context.roles,
    });

    const structuredContent = {
      current_project: {
        id: result.project.id,
        title: result.project.title,
        status: result.project.status ?? '',
        roles: result.project.roles,
        created_at: result.project.createdAt ?? '',
      },
      project_switching:
        'To use another OWOX project, disconnect and reconnect this MCP server, then sign in again and choose the desired project during OWOX authorization.',
    };

    return {
      structuredContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(structuredContent, null, 2),
        },
      ],
    };
  }
}
