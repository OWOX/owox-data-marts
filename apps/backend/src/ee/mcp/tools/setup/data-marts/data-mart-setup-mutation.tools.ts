import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { DataMartIconValue } from '../../../../../data-marts/enums/data-mart-icon.enum';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';
import {
  createInput,
  definitionMutationInput,
  metadataInput,
  publishInput,
  deleteInput,
  mutationOutput,
} from './data-mart-setup.schemas';

@Injectable()
export class CreateDataMartTool implements McpToolDefinition<z.input<typeof createInput>> {
  readonly name = 'create_data_mart';
  readonly description =
    'Create a draft Data Mart using a permitted Storage. Reuse operationId on retry; an unknown legacy create must be reconciled in the application before another create.';
  readonly zodSchema = createInput.shape;
  readonly outputSchema = mutationOutput.shape;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof createInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = createInput.parse(input);
    const { icon, ...values } = parsed;
    return jsonToolResult({
      ...(await this.setup.create({
        ...values,
        ...actor,
        ...(Object.hasOwn(parsed, 'icon') ? { icon: icon as DataMartIconValue | null } : {}),
      })),
    });
  }
}
@Injectable()
export class UpdateDataMartDefinitionTool implements McpToolDefinition<
  z.input<typeof definitionMutationInput>
> {
  readonly name = 'update_data_mart_definition';
  readonly description =
    'Replace the definition at expectedRevision. For a published Data Mart present get_data_mart_change_impact for this exact definition, obtain express user authorization, and supply its digest. Connector credentials and production configuration are selected in the application; pass its current preparation reference.';
  readonly zodSchema = definitionMutationInput.shape;
  readonly outputSchema = mutationOutput.shape;
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof definitionMutationInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    return jsonToolResult({
      ...(await this.setup.updateDefinition({ ...definitionMutationInput.parse(input), ...actor })),
    });
  }
}
@Injectable()
export class UpdateDataMartMetadataTool implements McpToolDefinition<
  z.input<typeof metadataInput>
> {
  readonly name = 'update_data_mart_metadata';
  readonly description =
    'Atomically patch Data Mart title, description, and icon at expectedRevision. Omitted fields stay unchanged; null explicitly clears description or icon.';
  readonly zodSchema = metadataInput.shape;
  readonly outputSchema = mutationOutput.shape;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof metadataInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = metadataInput.parse(input);
    const { icon, ...values } = parsed;
    return jsonToolResult({
      ...(await this.setup.updateMetadata({
        ...values,
        ...actor,
        ...(Object.hasOwn(parsed, 'icon') ? { icon: icon as DataMartIconValue | null } : {}),
      })),
    });
  }
}
@Injectable()
export class PublishDataMartTool implements McpToolDefinition<z.input<typeof publishInput>> {
  readonly name = 'publish_data_mart';
  readonly description =
    'Validate and publish the exact draft revision and its configured audience. Reuse operationId on retry. Connector publication atomically queues one initial run and reports its run/trigger separately from data readiness.';
  readonly zodSchema = publishInput.shape;
  readonly outputSchema = mutationOutput.shape;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof publishInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    return jsonToolResult({
      ...(await this.setup.publish({ ...publishInput.parse(input), ...actor })),
    });
  }
}
@Injectable()
export class DeleteDataMartTool implements McpToolDefinition<z.input<typeof deleteInput>> {
  readonly name = 'delete_data_mart';
  readonly description =
    'Delete the specified Data Mart after presenting its current deletion impact and obtaining express user authorization. Supply expectedRevision and the reviewed impactDigest; reuse operationId for recovery. Removes related Reports, triggers and relationships, preserves warehouse tables.';
  readonly zodSchema = deleteInput.shape;
  readonly outputSchema = mutationOutput.shape;
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly setup: McpDataMartSetupFacade
  ) {}
  async handler(input: z.input<typeof deleteInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    return jsonToolResult({
      ...(await this.setup.delete({ ...deleteInput.parse(input), ...actor })),
    });
  }
}
