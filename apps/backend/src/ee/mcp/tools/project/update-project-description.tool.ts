import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { maxLength } from 'class-validator';
import { z } from 'zod-v4';
import {
  PROJECT_SETTINGS_FACADE,
  type ProjectSettingsFacade,
} from '../../../../project-settings/facades/project-settings.facade';
import { PROJECT_DESCRIPTION_MAX_LENGTH } from '../../../../project-settings/dto/presentation/update-project-description-api.dto';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z
  .object({
    description: z
      .string()
      .min(1)
      .refine(
        value => maxLength(value, PROJECT_DESCRIPTION_MAX_LENGTH),
        'Description must not exceed 10000 characters'
      )
      .nullable()
      .describe(
        'Project description, 1–10000 characters using the same Unicode length rules as the project settings API. Pass null to clear it.'
      ),
  })
  .strict();
type UpdateProjectDescriptionInput = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateProjectDescriptionTool implements McpToolDefinition<UpdateProjectDescriptionInput> {
  readonly name = 'update_project_description';
  readonly description =
    'Update the description of the current OWOX project selected for this MCP connection. Requires a project admin. Provide 1–10000 characters or null to clear the description. Leading and trailing whitespace is trimmed using the existing project settings behavior.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = { description: z.string().nullable() };
  readonly annotations = {
    title: 'Update Project Description',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(@Inject(PROJECT_SETTINGS_FACADE) private readonly settings: ProjectSettingsFacade) {}

  parseInput(input: unknown): UpdateProjectDescriptionInput {
    return inputSchema.parse(input);
  }

  async handler(
    input: UpdateProjectDescriptionInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const result = await this.settings.updateDescription(
      { projectId: context.projectId, userId: context.userId, roles: context.roles },
      parsed
    );
    return jsonToolResult({ description: result.description });
  }
}
