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
import { createStorageSchema, storageOutputSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof createStorageSchema>;

@Injectable()
export class CreateStorageTool implements McpToolDefinition<Input> {
  readonly name = 'create_storage';
  readonly description =
    'Create an unconfigured Storage and return its ID. Sharing allows use but not maintenance.';
  readonly zodSchema = createStorageSchema;
  readonly outputSchema = storageOutputSchema;
  readonly annotations = {
    title: 'Create Storage',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new StorageToolMapper();

  constructor(
    @Inject(MCP_STORAGE_MANAGEMENT_FACADE) private readonly storages: McpStorageManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = createStorageSchema.parse(input);
    const storage = await storageToolCall(
      () =>
        this.storages.create(this.mapper.toActor(context), {
          type: parsed.storage_type,
          ...(parsed.title !== undefined ? { title: parsed.title } : {}),
        }),
      'create'
    );
    return jsonToolResult(this.mapper.toStorage(storage));
  }
}
