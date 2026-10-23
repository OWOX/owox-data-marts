import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z
  .object({
    storage_id: z.string().min(1).describe('Usable storage ID from list_data_storages.'),
    level: z
      .enum(['namespaces', 'resources'])
      .describe('List namespaces first, then list resources inside a returned namespace.'),
    namespace_id: z
      .string()
      .min(1)
      .optional()
      .describe('Required when level is resources. Copy an id from the namespaces result.'),
    resource_type: z
      .enum(['TABLE', 'VIEW', 'TABLE_PATTERN'])
      .optional()
      .describe('Optional warehouse resource kind filter.'),
  })
  .strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ListStorageResourcesTool implements McpToolDefinition<Input> {
  readonly name = 'list_storage_resources';
  readonly description =
    'Discover warehouse namespaces or tables and views using an existing project storage. First use level=namespaces, then level=resources with namespace_id from that result. Returned fullyQualifiedName values can be used in TABLE or VIEW Data Mart definitions. Optional resource_type filters the result. Requires permission to use the storage; no credentials are returned.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    namespaces: z
      .array(z.object({ id: z.string(), label: z.string().optional() }))
      .optional()
      .describe(
        'Present for level=namespaces; use each id as namespace_id in a subsequent resources call.'
      ),
    resources: z
      .array(
        z.object({
          id: z.string(),
          groupId: z.string(),
          type: z.enum(['TABLE', 'VIEW']),
          fullyQualifiedName: z
            .string()
            .describe(
              'Copy into a TABLE or VIEW definition without constructing the name yourself.'
            ),
          location: z.string().optional(),
          locationMismatch: z.boolean().optional(),
        })
      )
      .optional()
      .describe(
        'Present for level=resources; lists tables and views inside the requested namespace.'
      ),
  };
  readonly annotations = {
    title: 'ListStorageResources',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    const parsed = inputSchema.parse(input);
    if (parsed.level === 'resources' && !parsed.namespace_id) {
      throw new Error('namespace_id is required for level=resources');
    }
    return parsed;
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const result = await this.facade.listStorageResources(ctx, {
      storageId: parsed.storage_id,
      level: parsed.level,
      ...(parsed.namespace_id !== undefined ? { namespaceId: parsed.namespace_id } : {}),
      ...(parsed.resource_type !== undefined ? { resourceType: parsed.resource_type } : {}),
    });
    return jsonToolResult({
      ...(result.namespaces !== undefined ? { namespaces: result.namespaces } : {}),
      ...(result.resources !== undefined ? { resources: result.resources } : {}),
    });
  }
}
