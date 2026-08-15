import { castError } from '@owox/internal-helpers';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_PROJECT_CONTEXT_FACADE,
  type McpProjectContextFacade,
} from '../../../idp/facades/mcp-project-context.facade';
import {
  PROJECT_SETTINGS_FACADE,
  type ProjectSettingsFacade,
} from '../../../project-settings/facades/project-settings.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';

type GetProjectContextInput = Record<string, never>;

@Injectable()
export class GetProjectContextTool implements McpToolDefinition<GetProjectContextInput> {
  private readonly logger = new Logger(GetProjectContextTool.name);

  readonly name = 'get_project_context';
  readonly description =
    'Returns the current OWOX project selected for this MCP connection, including its complete admin-maintained project description, id, title, roles, status, and creation date. Call this tool before the first project-specific operation in a conversation and when the user asks which project is current, active, selected, or connected. If the user asks how to change or switch projects, explain that project selection happens during OWOX authorization: disconnect and reconnect this MCP server, then sign in again and choose the desired project.';
  readonly zodSchema = {};
  readonly outputSchema = {
    current_project: z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.string(),
      roles: z.array(z.string()),
      created_at: z.string(),
    }),
    project_switching: z.string(),
  };
  readonly annotations = {
    title: 'Get Project Context',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  private readonly inputSchema = z.object({}).strict();

  constructor(
    @Inject(MCP_PROJECT_CONTEXT_FACADE)
    private readonly projectContext: McpProjectContextFacade,
    @Inject(PROJECT_SETTINGS_FACADE)
    private readonly projectSettings: ProjectSettingsFacade
  ) {}

  parseInput(input: unknown): GetProjectContextInput {
    return this.inputSchema.parse(input);
  }

  async handler(input: GetProjectContextInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);

    const [result, description] = await Promise.all([
      this.projectContext.getProjectContext({
        userId: context.userId,
        projectId: context.projectId,
        roles: context.roles,
      }),
      this.projectSettings.getDescription(context.projectId).catch((error: unknown) => {
        this.logger.warn('Failed to load project description for MCP project context', {
          projectId: context.projectId,
          error: castError(error).message,
        });
        return null;
      }),
    ]);

    const structuredContent = {
      current_project: {
        id: result.project.id,
        title: result.project.title,
        description,
        status: result.project.status ?? '',
        roles: result.project.roles,
        created_at: result.project.createdAt ?? '',
      },
      project_switching:
        'To use another OWOX project, disconnect and reconnect this MCP server, then sign in again and choose the desired project during OWOX authorization.',
    };

    return jsonToolResult(structuredContent);
  }
}
