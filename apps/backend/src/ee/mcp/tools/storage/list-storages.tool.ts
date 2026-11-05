import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  MCP_STORAGE_MANAGEMENT_FACADE,
  type McpStorageManagementFacade,
} from '../../../../data-marts/facades/mcp-storage-management.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { StorageToolMapper } from './storage-tool.mapper';
import { listStoragesSchema, storageSummaryOutputSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof listStoragesSchema>;

@Injectable()
export class ListStoragesTool implements McpToolDefinition<Input> {
  readonly name = 'list_storages';
  readonly description =
    'List Storages in the connected project. Filter by Storage type or owner. Use get_storage to inspect configuration and access settings.';
  readonly zodSchema = listStoragesSchema;
  readonly outputSchema = { storages: z.array(z.object(storageSummaryOutputSchema)) };
  readonly annotations = {
    title: 'List Storages',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new StorageToolMapper();

  constructor(
    @Inject(MCP_STORAGE_MANAGEMENT_FACADE) private readonly storages: McpStorageManagementFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = listStoragesSchema.parse(input);
    const storages = await storageToolCall(
      () =>
        this.storages.list(this.mapper.toActor(context), {
          type: parsed.storage_type,
          ownerId: parsed.owner_id,
          ownerFilter: parsed.owner_filter,
        }),
      'list'
    );
    const publicOrigin = this.publicOriginService.getPublicOrigin();
    return jsonToolResult({
      storages: storages.map(storage =>
        this.mapper.toSummary(storage, context.projectId, publicOrigin)
      ),
    });
  }
}
