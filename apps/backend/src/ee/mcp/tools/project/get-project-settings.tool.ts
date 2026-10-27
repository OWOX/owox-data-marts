import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  PROJECT_SETTINGS_FACADE,
  type ProjectSettingsFacade,
} from '../../../../project-settings/facades/project-settings.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z.object({}).strict();
type GetProjectSettingsInput = Record<string, never>;

@Injectable()
export class GetProjectSettingsTool implements McpToolDefinition<GetProjectSettingsInput> {
  readonly name = 'get_project_settings';
  readonly description =
    'Get settings for the current OWOX project selected for this MCP connection, including its full admin-maintained description (null when missing). Requires project viewer access.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = { description: z.string().nullable() };
  readonly annotations = {
    title: 'Get Project Settings',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';

  constructor(@Inject(PROJECT_SETTINGS_FACADE) private readonly settings: ProjectSettingsFacade) {}

  parseInput(input: unknown): GetProjectSettingsInput {
    return inputSchema.parse(input);
  }

  async handler(input: GetProjectSettingsInput, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);
    const result = await this.settings.getSettings(context.projectId);
    return jsonToolResult({ description: result.description });
  }
}
