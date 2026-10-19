import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_MODEL_FACADE,
  type McpDataMartModelFacade,
  type DataMartModelSchemaRequest,
} from '../../../../../data-marts/facades/mcp-data-mart-model.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import {
  actualizeSchemaInput,
  updateSchemaInput,
  relationshipsInput,
  accessInput,
  modelMutationOutput,
} from './model-mutation.schemas';

@Injectable()
export class ActualizeDataMartSchemaTool implements McpToolDefinition<
  z.input<typeof actualizeSchemaInput>
> {
  readonly name = 'actualize_data_mart_schema';
  readonly description =
    'Refresh the saved Data Mart schema against its warehouse using existing field merging. Warehouse charges may apply. Requires current edit and Storage USE access; fails if configuration changed during refresh.';
  readonly zodSchema = actualizeSchemaInput.shape;
  readonly outputSchema = modelMutationOutput.shape;
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade
  ) {}
  async handler(input: z.input<typeof actualizeSchemaInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    return jsonToolResult({
      ...modelMutationOutput.parse(
        await this.model.actualizeSchema({ ...actualizeSchemaInput.parse(input), ...actor })
      ),
    });
  }
}
@Injectable()
export class UpdateDataMartSchemaTool implements McpToolDefinition<
  z.input<typeof updateSchemaInput>
> {
  readonly name = 'update_data_mart_schema';
  readonly description =
    'Update saved field metadata and calculated fields with existing type, status, formula and join validation. Connection status is server owned. Warehouse formula checks may incur charges; skipped checks return explicit warnings.';
  readonly zodSchema = updateSchemaInput.shape;
  readonly outputSchema = modelMutationOutput.shape;
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade
  ) {}
  async handler(input: z.input<typeof updateSchemaInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    const request = updateSchemaInput.parse(input);
    return jsonToolResult({
      ...modelMutationOutput.parse(
        await this.model.updateSchema({
          ...request,
          schema: request.schema as DataMartModelSchemaRequest['schema'],
          ...actor,
        })
      ),
    });
  }
}
@Injectable()
export class SetDataMartRelationshipsTool implements McpToolDefinition<
  z.input<typeof relationshipsInput>
> {
  readonly name = 'set_data_mart_relationships';
  readonly description =
    'Apply an explicit create/update/remove relationship change set and optional output configuration atomically. Omitted relationships are retained. Checks source and target permissions, aliases, storage, joins, formulas and output dependencies before writing.';
  readonly zodSchema = relationshipsInput.shape;
  readonly outputSchema = modelMutationOutput.shape;
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade
  ) {}
  async handler(input: z.input<typeof relationshipsInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    return jsonToolResult({
      ...modelMutationOutput.parse(
        await this.model.setRelationships({ ...relationshipsInput.parse(input), ...actor })
      ),
    });
  }
}
@Injectable()
export class SetDataMartAccessTool implements McpToolDefinition<z.input<typeof accessInput>> {
  readonly name = 'set_data_mart_access';
  readonly description =
    'Inspect proposed owner and reporting/maintenance availability changes to see current/proposed audience and impact digest. Present that impact and obtain express user authorization before applying those exact changes with its revision and digest. Each requested part requires its own current domain permission. Context assignments use set_entity_contexts. Self-removal returns only the committed outcome.';
  readonly zodSchema = accessInput.shape;
  readonly outputSchema = modelMutationOutput.shape;
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_MODEL_FACADE) private readonly model: McpDataMartModelFacade
  ) {}
  async handler(input: z.input<typeof accessInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    return jsonToolResult({
      ...modelMutationOutput.parse(
        await this.model.setAccess({ ...accessInput.parse(input), ...actor })
      ),
    });
  }
}
