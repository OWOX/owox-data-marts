import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import {
  dataMartIdInput,
  impactInput,
  impactOutput,
  listInput,
  setupOutput,
  summaryOutput,
  validationInput,
  validationOutput,
} from './data-mart-setup.schemas';

const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
@Injectable()
export class ListSetupDataMartsTool implements McpToolDefinition<z.input<typeof listInput>> {
  readonly name = 'list_setup_data_marts';
  readonly description =
    'List authorized draft and published Data Mart summaries. Use get_data_mart_setup for configuration and audience.';
  readonly zodSchema = listInput.shape;
  readonly outputSchema = { items: z.array(summaryOutput).max(100), hasMore: z.boolean() };
  readonly annotations = annotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof listInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    return jsonToolResult({ ...(await this.setup.list({ ...listInput.parse(input), ...actor })) });
  }
}
@Injectable()
export class GetDataMartSetupTool implements McpToolDefinition<z.input<typeof dataMartIdInput>> {
  readonly name = 'get_data_mart_setup';
  readonly description =
    'Read authorized Data Mart configuration, sharing, owners, Contexts, visible relationships and schedule summaries. Connector configuration remains app-managed. Includes the configuration revision and schema input binding.';
  readonly zodSchema = dataMartIdInput.shape;
  readonly outputSchema = setupOutput.shape;
  readonly annotations = annotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof dataMartIdInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    return jsonToolResult({
      ...(await this.setup.get({ ...dataMartIdInput.parse(input), ...actor })),
    });
  }
}
@Injectable()
export class ValidateDataMartTool implements McpToolDefinition<z.input<typeof validationInput>> {
  readonly name = 'validate_data_mart';
  readonly description =
    'Validate the saved definition shape and provider capability statically, or request live warehouse validation with both scopes and edit/use permissions. Never saves schema or status. Results identify the evaluated configuration revision.';
  readonly zodSchema = validationInput.shape;
  readonly outputSchema = validationOutput.shape;
  readonly annotations = { ...annotations, openWorldHint: true };
  // Static validation is available with read; live admission explicitly requires both scopes.
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof validationInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(
      context,
      input?.mode === 'live' ? 'live' : 'stored-read'
    );
    return jsonToolResult({
      ...(await this.setup.validate({ ...validationInput.parse(input), ...actor })),
    });
  }
}
@Injectable()
export class GetDataMartChangeImpactTool implements McpToolDefinition<z.input<typeof impactInput>> {
  readonly name = 'get_data_mart_change_impact';
  readonly description =
    'Observe current definition-change or deletion impact: visible inbound/outbound relationships, Reports, all schedule types, audience and legacy deletion. Hidden dependencies are indicated without identifiers. Returns the configuration revision and digest binding the proposed change and dependencies; obtain express user authorization before mutation.';
  readonly zodSchema = impactInput.shape;
  readonly outputSchema = impactOutput.shape;
  readonly annotations = annotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof impactInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    return jsonToolResult({
      ...(await this.setup.impact({ ...impactInput.parse(input), ...actor })),
    });
  }
}
