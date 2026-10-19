import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_CUSTOM_CONNECTORS_FACADE,
  type McpCustomConnectorsFacade,
} from '../../../../../data-marts/facades/mcp-custom-connectors.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';

const noInput = z.object({}).strict();
const pageInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
const setupInput = z
  .object({
    connectorId: z.string().uuid(),
    versionsLimit: z.number().int().min(1).max(100).default(25),
    versionsOffset: z.number().int().min(0).max(10000).default(0),
    activationVersion: z.number().int().positive().optional(),
  })
  .strict();
const validationInput = z
  .object({
    connectorId: z.string().uuid(),
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
const metadata = z
  .object({
    id: z.string(),
    name: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    docUrl: z.string().nullable(),
    activeVersion: z.number().int().positive().nullable(),
    revision: z.number().int().positive(),
    appUrl: z.string().url(),
  })
  .strict();
const version = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(['draft', 'published']),
    publishedAt: z.string().datetime().nullable(),
    active: z.boolean(),
  })
  .strict();
const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

@Injectable()
export class GetConnectorAuthoringSchemaTool implements McpToolDefinition<z.input<typeof noInput>> {
  readonly name = 'get_connector_authoring_schema';
  readonly description =
    'Read the deployed declarative connector format, source-name, size and credential constraints. Safe editing requires explicit preparation in the application; test credentials require separate app approval of the saved draft.';
  readonly zodSchema = noInput.shape;
  readonly outputSchema = {
    format: z.literal('owox-declarative-manifest'),
    maxManifestBytes: z.number().int().positive(),
    requiredManifestKeys: z.array(z.string()).max(5),
    sourceName: z
      .object({ pattern: z.string(), maxLength: z.number().int(), mutable: z.literal(false) })
      .strict(),
    authenticationTypes: z.array(z.string()).max(6),
    credentials: z
      .object({
        parameterAttribute: z.literal('SECRET'),
        literalAuthValuesAllowed: z.literal(false),
        secretParameterDefaultsAllowed: z.literal(false),
      })
      .strict(),
    versions: z
      .object({
        publishedImmutable: z.literal(true),
        draftSaveChangesActiveVersion: z.literal(false),
      })
      .strict(),
    safeEditingAvailable: z.literal(true),
    approvedTestBindingAvailable: z.literal(true),
    revisionAvailable: z.literal(true),
    appUrl: z.string().url(),
  };
  readonly annotations = annotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof noInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    noInput.parse(input);
    return jsonToolResult({ ...(await this.facade.getAuthoringSchema(actor)) });
  }
}

@Injectable()
export class ListCustomConnectorsTool implements McpToolDefinition<z.input<typeof pageInput>> {
  readonly name = 'list_custom_connectors';
  readonly description =
    'List project Custom Connector metadata and active version numbers, without reading raw manifests or making external calls.';
  readonly zodSchema = pageInput.shape;
  readonly outputSchema = { items: z.array(metadata).max(100), hasMore: z.boolean() };
  readonly annotations = annotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof pageInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = pageInput.parse(input);
    return jsonToolResult({ ...(await this.facade.listConnectors({ ...parsed, ...actor })) });
  }
}

@Injectable()
export class GetCustomConnectorSetupTool implements McpToolDefinition<z.input<typeof setupInput>> {
  readonly name = 'get_custom_connector_setup';
  readonly description =
    'Read metadata, versions and current activation/deletion dependency impact. Pinned consumers remain pinned. Inaccessible consumers are counted without details. Returns an explicitly prepared safe draft with server references, current revision and action-specific impact digests; arbitrary unprepared manifests are withheld. activationVersion selects the reviewed activation target.';
  readonly zodSchema = setupInput.shape;
  readonly outputSchema = {
    connector: metadata,
    versions: z.array(version).max(100),
    hasMoreVersions: z.boolean(),
    editing: z
      .object({
        state: z.enum(['preparation_required', 'prepared']),
        revision: z.number().int().positive(),
        editableDraft: z
          .object({
            preparationId: z.string().uuid(),
            revision: z.number().int().positive(),
            version: z.number().int().positive(),
            manifest: z.record(z.string(), z.unknown()),
            expiresAt: z.string().datetime(),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    testApproval: z
      .object({
        approvalId: z.string().uuid(),
        revision: z.number().int().positive(),
        version: z.number().int().positive(),
        expiresAt: z.string().datetime(),
      })
      .strict()
      .nullable(),
    impact: z
      .object({
        activationVersion: z.number().int().positive().nullable(),
        activationDigest: z.string().nullable(),
        deletionDigest: z.string(),
        referencedConsumers: z.number().int().min(0),
        unpinnedConsumers: z.number().int().min(0),
        pinnedConsumers: z.number().int().min(0),
        hiddenConsumers: z.number().int().min(0),
        hasEditAccessToAllUnpinnedConsumers: z.boolean(),
        deletionBlockedByReferences: z.boolean(),
        visibleConsumers: z
          .array(
            z
              .object({
                id: z.string(),
                title: z.string(),
                pinnedVersion: z.number().int().positive().nullable(),
                affectedByActivation: z.boolean(),
                canEdit: z.boolean().nullable(),
              })
              .strict()
          )
          .max(100),
        visibleConsumersTruncated: z.boolean(),
      })
      .strict(),
  };
  readonly annotations = annotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof setupInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = setupInput.parse(input);
    return jsonToolResult({ ...(await this.facade.getConnector({ ...parsed, ...actor })) });
  }
}

@Injectable()
export class ValidateCustomConnectorTool implements McpToolDefinition<
  z.input<typeof validationInput>
> {
  readonly name = 'validate_custom_connector';
  readonly description =
    'Statically validate an explicitly selected stored connector version using the runtime parser and publication schemas. Checks UTF-8 bytes, stable source name and known credential positions. Returns fixed diagnostics; does not certify arbitrary JSON as safe to edit or authorize testing, publishing or loading.';
  readonly zodSchema = validationInput.shape;
  readonly outputSchema = {
    connectorId: z.string(),
    revision: z.number().int().positive(),
    version: z.number().int().positive(),
    status: z.enum(['draft', 'published']),
    valid: z.boolean(),
    assessment: z.literal('static_known_positions_only'),
    issues: z
      .array(
        z
          .object({
            code: z.enum([
              'manifest_too_large',
              'metadata_too_large',
              'source_name_mismatch',
              'literal_auth_secret',
              'secret_parameter_value',
              'secret_parameter_required',
              'manifest_invalid',
              'primary_key_required',
              'runtime_schema_invalid',
            ]),
            message: z.string(),
          })
          .strict()
      )
      .max(9),
  };
  readonly annotations = annotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof validationInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = validationInput.parse(input);
    return jsonToolResult({ ...(await this.facade.validateConnector({ ...parsed, ...actor })) });
  }
}

const revisionInput = {
  connectorId: z.string().uuid(),
  expectedRevision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
};
const operationInput = { ...revisionInput, operationId: z.string().trim().min(1).max(255) };
const mutationOutput = {
  connectorId: z.string(),
  revision: z.number().int().min(0),
  outcome: z.enum(['completed', 'incomplete', 'unknown', 'app_action_required']),
  appAction: z
    .object({
      projectId: z.string(),
      connectorId: z.string(),
      reason: z.enum(['manifest_preparation_required', 'test_credentials_approval_required']),
      appUrl: z.string().url(),
      operation: z.string(),
    })
    .strict()
    .optional(),
  version: z.number().int().positive().optional(),
  deleted: z.boolean().optional(),
  test: z
    .object({
      state: z.enum(['succeeded', 'failed']),
      rowCount: z.number().int().min(0),
      diagnostic: z.enum(['test_succeeded', 'test_failed']),
    })
    .strict()
    .optional(),
};

const create_custom_connectorInput = z
  .object({
    operationId: z.string().trim().min(1).max(255),
    name: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/)
      .max(255),
    title: z.string().trim().min(1).max(255),
    manifest: z.record(z.string(), z.unknown()),
    preparationId: z.string().uuid().optional(),
  })
  .strict();
@Injectable()
export class CreateCustomConnectorTool implements McpToolDefinition<
  z.input<typeof create_custom_connectorInput>
> {
  readonly name = 'create_custom_connector';
  readonly description =
    'Create a connector with a stable source name and a safe new declarative manifest. Never supply credentials or copied unprepared manifests. Caller operationId recovers the same create.';
  readonly zodSchema = create_custom_connectorInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof create_custom_connectorInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = create_custom_connectorInput.parse(input);
    return jsonToolResult({ ...(await this.facade.createConnector({ ...parsed, ...actor })) });
  }
}

const update_custom_connector_metadataInput = z
  .object({
    ...revisionInput,
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().max(65535).nullable().optional(),
    docUrl: z.string().max(255).nullable().optional(),
  })
  .strict();
@Injectable()
export class UpdateCustomConnectorMetadataTool implements McpToolDefinition<
  z.input<typeof update_custom_connector_metadataInput>
> {
  readonly name = 'update_custom_connector_metadata';
  readonly description =
    'Update connector display metadata at the reviewed revision, preserving stable source identity.';
  readonly zodSchema = update_custom_connector_metadataInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(
    input: z.input<typeof update_custom_connector_metadataInput>,
    context: McpAuthContext
  ) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = update_custom_connector_metadataInput.parse(input);
    return jsonToolResult({ ...(await this.facade.updateMetadata({ ...parsed, ...actor })) });
  }
}

const save_custom_connector_draftInput = z
  .object({
    ...revisionInput,
    preparationId: z.string().uuid(),
    manifest: z.record(z.string(), z.unknown()),
  })
  .strict();
@Injectable()
export class SaveCustomConnectorDraftTool implements McpToolDefinition<
  z.input<typeof save_custom_connector_draftInput>
> {
  readonly name = 'save_custom_connector_draft';
  readonly description =
    'Save an explicitly app-prepared safe draft at the current revision. Keep server protected references intact; do not send secret values. Draft saves do not change the active version.';
  readonly zodSchema = save_custom_connector_draftInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof save_custom_connector_draftInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = save_custom_connector_draftInput.parse(input);
    return jsonToolResult({ ...(await this.facade.saveDraft({ ...parsed, ...actor })) });
  }
}

const test_custom_connectorInput = z
  .object({
    ...operationInput,
    version: z.number().int().positive(),
    approvalId: z.string().uuid(),
    node: z.string().min(1).max(255),
    maxRows: z.number().int().min(1).max(1000).default(25),
    maxPages: z.number().int().min(1).max(50).default(1),
    timeoutMs: z.number().int().min(100).max(20000).default(20000),
  })
  .strict();
@Injectable()
export class TestCustomConnectorTool implements McpToolDefinition<
  z.input<typeof test_custom_connectorInput>
> {
  readonly name = 'test_custom_connector';
  readonly description =
    'Test the exact saved draft using its current app-approved test credentials and bounded public-network execution. An unknown outcome requires reconciliation; never automatically repeat with a new operation ID. Returns fixed diagnostics without provider data or logs.';
  readonly zodSchema = test_custom_connectorInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof test_custom_connectorInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    const parsed = test_custom_connectorInput.parse(input);
    return jsonToolResult({ ...(await this.facade.testConnector({ ...parsed, ...actor })) });
  }
}

const publish_custom_connectorInput = z
  .object({
    ...operationInput,
    version: z.number().int().positive(),
    preparationId: z.string().uuid(),
    impactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
@Injectable()
export class PublishCustomConnectorTool implements McpToolDefinition<
  z.input<typeof publish_custom_connectorInput>
> {
  readonly name = 'publish_custom_connector';
  readonly description =
    'Publish and activate the exact prepared saved draft after express user authorization of its current impact. Requires EDIT on every unpinned consumer; pinned versions stay pinned. Pass activationDigest from get_custom_connector_setup with activationVersion matching this draft. Retry the same operation ID to recover a committed publication.';
  readonly zodSchema = publish_custom_connectorInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof publish_custom_connectorInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = publish_custom_connectorInput.parse(input);
    return jsonToolResult({ ...(await this.facade.publishConnector({ ...parsed, ...actor })) });
  }
}

const activate_custom_connector_versionInput = z
  .object({
    ...operationInput,
    version: z.number().int().positive(),
    impactDigest: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
@Injectable()
export class ActivateCustomConnectorVersionTool implements McpToolDefinition<
  z.input<typeof activate_custom_connector_versionInput>
> {
  readonly name = 'activate_custom_connector_version';
  readonly description =
    'Activate the reviewed published version only after express user authorization of current impact. Requires EDIT on every unpinned consumer; pinned versions stay pinned. Pass activationDigest from get_custom_connector_setup with activationVersion matching this version.';
  readonly zodSchema = activate_custom_connector_versionInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(
    input: z.input<typeof activate_custom_connector_versionInput>,
    context: McpAuthContext
  ) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = activate_custom_connector_versionInput.parse(input);
    return jsonToolResult({ ...(await this.facade.activateVersion({ ...parsed, ...actor })) });
  }
}

const delete_custom_connectorInput = z
  .object({ ...operationInput, impactDigest: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
@Injectable()
export class DeleteCustomConnectorTool implements McpToolDefinition<
  z.input<typeof delete_custom_connectorInput>
> {
  readonly name = 'delete_custom_connector';
  readonly description =
    'Soft-delete an unused connector only after express user authorization of current deletion impact. Referenced connectors cannot be deleted. Pass deletionDigest from get_custom_connector_setup.';
  readonly zodSchema = delete_custom_connectorInput.shape;
  readonly outputSchema = mutationOutput;
  readonly annotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_CUSTOM_CONNECTORS_FACADE) private readonly facade: McpCustomConnectorsFacade
  ) {}
  async handler(input: z.input<typeof delete_custom_connectorInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'mutation');
    const parsed = delete_custom_connectorInput.parse(input);
    return jsonToolResult({ ...(await this.facade.deleteConnector({ ...parsed, ...actor })) });
  }
}
