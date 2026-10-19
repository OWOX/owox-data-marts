import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  projectDescriptionSchema,
  projectDescriptionRevisionSchema,
} from '../../../../../project-settings/dto/domain/project-description-update.schema';
import {
  MCP_PROJECT_SETUP_FACADE,
  type McpProjectSetupFacade,
} from '../../../../../project-settings/facades/mcp-project-setup.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import {
  jsonToolResult,
  type McpToolDefinition,
  type McpToolResult,
} from '../../mcp-tool.definition';

interface UpdateProjectDescriptionInput {
  description: string | null;
  expected_revision: number;
}

type UpdateProjectDescriptionOutput = { description: string | null; revision: number };

@Injectable()
export class UpdateProjectDescriptionTool implements McpToolDefinition<UpdateProjectDescriptionInput> {
  readonly name = 'update_project_description';
  readonly description =
    'Replace the project Markdown description as a current admin using the revision from get_project_setup. Send explicit null to clear. Stale writes conflict; read the current description and resolve the change before retrying.';
  readonly zodSchema = {
    description: projectDescriptionSchema,
    expected_revision: projectDescriptionRevisionSchema,
  };
  readonly outputSchema = {
    description: z.string().nullable(),
    revision: projectDescriptionRevisionSchema,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = {
    title: 'Update Project Description',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  private readonly inputSchema = z.object(this.zodSchema).strict();

  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PROJECT_SETUP_FACADE) private readonly projectSetup: McpProjectSetupFacade
  ) {}

  async handler(
    input: UpdateProjectDescriptionInput,
    context: McpAuthContext
  ): Promise<McpToolResult> {
    const parsed = this.inputSchema.parse(input);
    const actor = await this.authorization.authorize(context, 'mutation');
    const saved = await this.projectSetup.updateProjectDescription({
      ...actor,
      description: parsed.description,
      expectedRevision: parsed.expected_revision,
    });
    const output: UpdateProjectDescriptionOutput = {
      description: saved.description,
      revision: saved.revision,
    };
    return jsonToolResult(output);
  }
}
