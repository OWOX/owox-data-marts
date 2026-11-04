import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import {
  MCP_STORAGE_MANAGEMENT_FACADE,
  type McpStorageManagementFacade,
} from '../../../../data-marts/facades/mcp-storage-management.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { StorageToolMapper } from './storage-tool.mapper';
import { listStorageResourcesSchema, storageResourcesOutputSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof listStorageResourcesSchema>;

@Injectable()
export class ListStorageResourcesTool implements McpToolDefinition<Input> {
  readonly name = 'list_storage_resources';
  readonly description =
    'Browse projects and table or view resources through a saved Google BigQuery Storage. Requires permission to use the Storage. Other Storage types do not support resource browsing.';
  readonly zodSchema = listStorageResourcesSchema;
  readonly outputSchema = storageResourcesOutputSchema;
  readonly annotations = {
    title: 'List Storage Resources',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new StorageToolMapper();

  constructor(
    @Inject(MCP_STORAGE_MANAGEMENT_FACADE) private readonly storages: McpStorageManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = listStorageResourcesSchema.parse(input);
    const result = await storageToolCall(
      () =>
        this.storages.listResources(this.mapper.toActor(context), parsed.storage_id, {
          level: parsed.level,
          namespaceId: parsed.namespace_id,
          resourceType: parsed.resource_type,
        }),
      'list_resources'
    );
    return jsonToolResult(this.mapper.toResources(parsed.storage_id, result));
  }
}
