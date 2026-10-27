import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_PROJECT_MEMBERS_FACADE,
  ProjectRole,
  RoleScope,
  type McpProjectMembersFacade,
} from '../../../../data-marts/facades/mcp-project-members.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z.object({}).strict();
type ListProjectMembersInput = Record<string, never>;

@Injectable()
export class ListProjectMembersTool implements McpToolDefinition<ListProjectMembersInput> {
  readonly name = 'list_project_members';
  readonly description =
    'List members of the OWOX project selected for this MCP connection, including user IDs, names, emails, roles, access scopes, and assigned Context IDs. Use returned user_id values for set_context_members; match members by name or email instead of guessing IDs. Requires project viewer access.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = {
    members: z.array(
      z.object({
        user_id: z.string().describe('Assignment ID for set_context_members.'),
        email: z.string().describe('Member email address for identifying the intended person.'),
        display_name: z.string().nullable().describe('Member display name; null when unavailable.'),
        avatar_url: z.string().nullable().describe('Member avatar URL; null when unavailable.'),
        role: z
          .enum(ProjectRole)
          .describe('Current project role: admin, editor (Data Owner), or viewer (Business User).'),
        role_scope: z
          .enum(RoleScope)
          .describe(
            'Whether role-based sharing applies to the entire project or selected Contexts. Resource and ownership checks still apply.'
          ),
        context_ids: z
          .array(z.string())
          .describe(
            'Assigned Context IDs. An empty list with selected_contexts grants no shared access through Context matching.'
          ),
      })
    ),
  };
  readonly annotations = {
    title: 'List Project Members',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  constructor(
    @Inject(MCP_PROJECT_MEMBERS_FACADE) private readonly members: McpProjectMembersFacade
  ) {}

  parseInput(input: unknown): ListProjectMembersInput {
    return inputSchema.parse(input);
  }

  async handler(input: ListProjectMembersInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);
    const members = await this.members.listProjectMembers(context.projectId);
    return jsonToolResult({
      members: members.map(member => ({
        user_id: member.userId,
        email: member.email,
        display_name: member.displayName ?? null,
        avatar_url: member.avatarUrl ?? null,
        role: member.role,
        role_scope: member.roleScope,
        context_ids: member.contextIds,
      })),
    });
  }
}
