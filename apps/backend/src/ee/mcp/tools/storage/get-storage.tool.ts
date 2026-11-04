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
import { storageToolCall } from './storage-tool-error';
import { storageTargetSchema, storageOutputSchema } from './storage.schemas';

type Input = z.infer<typeof storageTargetSchema>;

@Injectable()
export class GetStorageTool implements McpToolDefinition<Input> {
  readonly name = 'get_storage';
  readonly description =
    'Read a Storage that you can inspect. The result includes safe configuration, Credential status, owners, Contexts, and sharing settings.';
  readonly zodSchema = storageTargetSchema;
  readonly outputSchema = storageOutputSchema;
  readonly annotations = {
    title: 'Get Storage',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:read'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new StorageToolMapper();

  constructor(
    @Inject(MCP_STORAGE_MANAGEMENT_FACADE) private readonly storages: McpStorageManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = storageTargetSchema.parse(input);
    const storage = await storageToolCall(
      () => this.storages.get(this.mapper.toActor(context), parsed.storage_id),
      'get'
    );
    return jsonToolResult(this.mapper.toStorage(storage));
  }
}
