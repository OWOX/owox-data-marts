import { Inject, Injectable } from '@nestjs/common';
import type { McpScope } from '@owox/idp-protocol';
import { z } from 'zod-v4';
import {
  MCP_DATA_MART_SETUP_FACADE,
  type McpDataMartSetupFacade,
} from '../../../../data-marts/facades/mcp-data-mart-setup.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';

const inputSchema = z.object({}).strict();
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class ListDataStoragesTool implements McpToolDefinition<Input> {
  readonly name = 'list_data_storages';
  readonly description =
    'List existing storages the current user can use to create Data Marts in the connected project. Returns only storage identity and type. Choose a storage_id from this result for create_data_mart; use list_storage_resources to discover warehouse tables and views.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    storages: z.array(z.object({ id: z.string(), title: z.string(), type: z.string() })),
  };
  readonly annotations = {
    title: 'ListDataStorages',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];

  constructor(
    @Inject(MCP_DATA_MART_SETUP_FACADE) private readonly facade: McpDataMartSetupFacade
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    this.parseInput(input);
    const ctx = { projectId: context.projectId, userId: context.userId, roles: context.roles };
    const result = await this.facade.listDataStorages(ctx);
    return jsonToolResult({ storages: result });
  }
}
