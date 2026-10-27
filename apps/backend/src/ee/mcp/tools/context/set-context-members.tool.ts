import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CONTEXTS_FACADE,
  type McpContextsFacade,
} from '../../../../data-marts/facades/mcp-contexts.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z
  .object({
    context_id: z
      .string()
      .min(1)
      .describe('Context ID from list_contexts in the connected project.'),
    assigned_user_ids: z
      .array(z.string().min(1))
      .max(1000)
      .describe(
        'Complete replacement member list using user_id values from list_project_members. Empty removes all assignments. Admins have project-wide access and are dropped from this list.'
      ),
  })
  .strict();
type SetContextMembersInput = z.infer<typeof inputSchema>;

@Injectable()
export class SetContextMembersTool implements McpToolDefinition<SetContextMembersInput> {
  readonly name = 'set_context_members';
  readonly description =
    'Replace the members assigned to a Context in the connected OWOX project. Requires a project admin. Supply user_id values from list_project_members; an empty list removes all assignments. Admin IDs are ignored because admins have project-wide access and are returned as dropped_admin_ids.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = {
    assigned_user_ids: z.array(z.string()).describe('User IDs actually assigned to the Context.'),
    dropped_admin_ids: z
      .array(z.string())
      .describe('Requested admin IDs omitted because admins already have project-wide access.'),
  };
  readonly annotations = {
    title: 'Set Context Members',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'admin';

  constructor(@Inject(MCP_CONTEXTS_FACADE) private readonly contexts: McpContextsFacade) {}

  parseInput(input: unknown): SetContextMembersInput {
    return inputSchema.parse(input);
  }

  async handler(input: SetContextMembersInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.contexts.setContextMembers(
      { projectId: context.projectId, userId: context.userId },
      { contextId: parsed.context_id, assignedUserIds: parsed.assigned_user_ids }
    );
    return jsonToolResult({
      assigned_user_ids: result.assignedUserIds,
      dropped_admin_ids: result.droppedAdminIds,
    });
  }
}
