import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_SETUP_DISCOVERY_FACADE,
  type McpSetupDiscoveryFacade,
} from '../../../../../data-marts/facades/mcp-setup-discovery.facade';
import type { McpAuthContext } from '../../../auth/mcp-auth-context';
import { SetupAuthorizationService } from '../../../setup/setup-authorization.service';
import { jsonToolResult, type McpToolDefinition } from '../../mcp-tool.definition';

const id = z.string().uuid();
const page = {
  limit: z.number().int().min(1).max(100).default(25),
  offset: z.number().int().min(0).max(10000).default(0),
};
const storageInput = z.object(page).strict();
const connectorInput = z.object({ storageId: id, ...page }).strict();
const resourcesInput = z
  .object({
    storageId: id,
    level: z.enum(['namespaces', 'resources']),
    namespaceId: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,254}$/)
      .optional(),
    resourceType: z.enum(['TABLE', 'VIEW', 'TABLE_PATTERN']).optional(),
    ...page,
  })
  .strict()
  .refine(input => input.level !== 'resources' || !!input.namespaceId, {
    message: 'namespaceId is required for resources',
  });
const requirementsInput = z
  .object({
    storageId: id,
    connectorName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,254}$/),
    version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict();
const connectorOutput = z
  .object({
    name: z.string(),
    title: z.string(),
    kind: z.enum(['built-in', 'custom']),
    activeVersion: z.number().int().nullable(),
    publishedVersions: z.array(z.number().int()).max(100),
    versionsTruncated: z.boolean(),
  })
  .strict();
const storedAnnotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

@Injectable()
export class ListSetupStoragesTool implements McpToolDefinition<z.input<typeof storageInput>> {
  readonly name = 'list_setup_storages';
  readonly description =
    'List visible storages in the connected project and their runtime setup capabilities. Availability does not grant permission to edit or load.';
  readonly zodSchema = storageInput.shape;
  readonly outputSchema = {
    items: z
      .array(
        z
          .object({
            id: z.string(),
            title: z.string(),
            type: z.string(),
            availableForUse: z.boolean(),
            availableForMaintenance: z.boolean(),
            capabilities: z
              .object({
                liveResourceBrowsing: z.boolean(),
                connectorLoad: z.boolean(),
                definitionTypes: z
                  .array(z.enum(['SQL', 'TABLE', 'VIEW', 'TABLE_PATTERN', 'CONNECTOR']))
                  .max(5),
              })
              .strict(),
          })
          .strict()
      )
      .max(100),
    hasMore: z.boolean(),
  };
  readonly annotations = storedAnnotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_SETUP_DISCOVERY_FACADE) private readonly discovery: McpSetupDiscoveryFacade
  ) {}
  async handler(input: z.input<typeof storageInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = storageInput.parse(input);
    return jsonToolResult({ ...(await this.discovery.listStorages({ ...parsed, ...actor })) });
  }
}

@Injectable()
export class ListStorageResourcesTool implements McpToolDefinition<z.input<typeof resourcesInput>> {
  readonly name = 'list_storage_resources';
  readonly description =
    'Browse live warehouse namespaces or resources using a storage the current user can use. Requires both scopes; supported only for Google BigQuery. Never performs queries or loads.';
  readonly zodSchema = resourcesInput.shape;
  readonly outputSchema = {
    source: z.literal('live'),
    items: z
      .array(
        z
          .object({
            id: z.string(),
            label: z.string().optional(),
            groupId: z.string().optional(),
            type: z.enum(['TABLE', 'VIEW']).optional(),
            fullyQualifiedName: z.string().optional(),
            location: z.string().optional(),
            locationMismatch: z.boolean().optional(),
          })
          .strict()
      )
      .max(100),
    hasMore: z.boolean(),
  };
  readonly annotations = { ...storedAnnotations, openWorldHint: true };
  readonly requiredScopes: McpScope[] = ['mcp:read', 'mcp:write'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_SETUP_DISCOVERY_FACADE) private readonly discovery: McpSetupDiscoveryFacade
  ) {}
  async handler(input: z.input<typeof resourcesInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'live');
    const parsed = resourcesInput.parse(input);
    return jsonToolResult({
      ...(await this.discovery.listStorageResources({ ...parsed, ...actor })),
    });
  }
}

@Injectable()
export class ListSetupConnectorsTool implements McpToolDefinition<z.input<typeof connectorInput>> {
  readonly name = 'list_setup_connectors';
  readonly description =
    'List built-in and published custom connectors compatible with a usable storage in the connected project. Built-in versions follow the deployed application; custom versions can be pinned.';
  readonly zodSchema = connectorInput.shape;
  readonly outputSchema = { items: z.array(connectorOutput).max(100), hasMore: z.boolean() };
  readonly annotations = storedAnnotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_SETUP_DISCOVERY_FACADE) private readonly discovery: McpSetupDiscoveryFacade
  ) {}
  async handler(input: z.input<typeof connectorInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = connectorInput.parse(input);
    return jsonToolResult({ ...(await this.discovery.listConnectors({ ...parsed, ...actor })) });
  }
}

@Injectable()
export class GetConnectorSetupRequirementsTool implements McpToolDefinition<
  z.input<typeof requirementsInput>
> {
  readonly name = 'get_connector_setup_requirements';
  readonly description =
    'Read static connector parameter types and credential/OAuth requirements for a usable storage. Credential state is not checked. Configure credentials in the Data Mart app flow; never supply secrets to MCP.';
  readonly zodSchema = requirementsInput.shape;
  readonly outputSchema = {
    connector: connectorOutput,
    parameters: z
      .array(
        z
          .object({
            path: z.string(),
            required: z.boolean(),
            type: z.string(),
            dynamicOptions: z.boolean(),
            minimum: z.number().optional(),
          })
          .strict()
      )
      .max(500),
    authorization: z
      .array(
        z
          .object({
            path: z.string(),
            required: z.boolean(),
            method: z.enum(['credential', 'oauth']),
          })
          .strict()
      )
      .max(500),
    capabilities: z
      .object({ singleConfiguration: z.boolean(), copySecretsByValue: z.boolean() })
      .strict(),
    limits: z
      .object({
        minimumConfigurations: z.literal(1),
        maximumConfigurations: z.literal(1).nullable(),
        minimumFields: z.literal(1),
      })
      .strict(),
    credentialState: z.literal('not_checked'),
    appUrl: z.string().url(),
  };
  readonly annotations = storedAnnotations;
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  constructor(
    private readonly authorization: SetupAuthorizationService,
    @Inject(MCP_SETUP_DISCOVERY_FACADE) private readonly discovery: McpSetupDiscoveryFacade
  ) {}
  async handler(input: z.input<typeof requirementsInput>, context: McpAuthContext) {
    const actor = await this.authorization.authorize(context, 'stored-read');
    const parsed = requirementsInput.parse(input);
    return jsonToolResult({
      ...(await this.discovery.getConnectorRequirements({ ...parsed, ...actor })),
    });
  }
}
