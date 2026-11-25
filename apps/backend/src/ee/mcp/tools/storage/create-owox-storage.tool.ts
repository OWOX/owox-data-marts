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
import { createOwoxStorageSchema, storageOutputSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof createOwoxStorageSchema>;

@Injectable()
export class CreateOwoxStorageTool implements McpToolDefinition<Input> {
  readonly name = 'create_owox_storage';
  readonly description =
    'Create an OWOX Storage and return its ID and UI URL. OWOX hosts it, so it needs no data warehouse, Credential or configuration, and it is ready for Data Marts at once. A project can have one OWOX Storage in each location. list_storages returns the free locations in owox_storage_offer. Ask the user which location to use, because it cannot change later. The call can take up to a minute. Before you create a Storage, call get_owox_guide({topic: "storages_destinations"}).';
  readonly zodSchema = createOwoxStorageSchema;
  readonly outputSchema = storageOutputSchema;
  readonly annotations = {
    title: 'Create OWOX Storage',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new StorageToolMapper();

  constructor(
    @Inject(MCP_STORAGE_MANAGEMENT_FACADE) private readonly storages: McpStorageManagementFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = createOwoxStorageSchema.parse(input);
    const storage = await storageToolCall(
      () =>
        this.storages.createOwoxStorage(this.mapper.toActor(context), {
          location: parsed.location,
          ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        }),
      'create_owox_storage'
    );
    return jsonToolResult(
      this.mapper.toStorage(storage, context.projectId, this.publicOriginService.getPublicOrigin())
    );
  }
}
