import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import { PublicOriginService } from '../../../../../common/config/public-origin.service';
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

type GetProjectSetupOutput = {
  project: {
    id: string;
    title: string;
    status: string | null;
    roles: string[];
    created_at: string | null;
  };
  description: string | null;
  revision: number;
  can_update_description: boolean;
  project_settings_url: string;
};

type GetProjectSetupInput = Record<string, never>;

@Injectable()
export class GetProjectSetupTool implements McpToolDefinition<GetProjectSetupInput> {
  readonly name = 'get_project_setup';
  readonly description =
    'Read the connected project identity, full Markdown description and current setup actions. Project description is separate from Context entities.';
  readonly zodSchema = {};
  readonly outputSchema = {
    project: z
      .object({
        id: z.string(),
        title: z.string(),
        status: z.string().nullable(),
        roles: z.array(z.string()),
        created_at: z.string().nullable(),
      })
      .strict(),
    description: z.string().nullable(),
    revision: z.number().int().nonnegative(),
    can_update_description: z.boolean(),
    project_settings_url: z.string().url(),
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly annotations = {
    title: 'Get Project Setup',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  private readonly inputSchema = z.object(this.zodSchema).strict();

  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_PROJECT_SETUP_FACADE) private readonly projectSetup: McpProjectSetupFacade,
    private readonly publicOrigin: PublicOriginService
  ) {}

  async handler(input: GetProjectSetupInput, context: McpAuthContext): Promise<McpToolResult> {
    this.inputSchema.parse(input);
    const actor = await this.authorization.authorize(context, 'stored-read');
    const result = await this.projectSetup.getProjectSetup(actor);
    const output: GetProjectSetupOutput = {
      project: {
        id: result.project.id,
        title: result.project.title,
        status: result.project.status,
        roles: result.project.roles,
        created_at: result.project.createdAt,
      },
      description: result.description,
      revision: result.revision,
      can_update_description: result.canUpdateDescription && context.scopes.includes('mcp:write'),
      project_settings_url: new URL(
        `/ui/${encodeURIComponent(actor.projectId)}/project-settings`,
        this.publicOrigin.getPublicOrigin()
      ).toString(),
    };
    return jsonToolResult(output);
  }
}
