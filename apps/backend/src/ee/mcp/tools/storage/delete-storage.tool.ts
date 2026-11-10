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
import { storageTargetSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof storageTargetSchema>;

@Injectable()
export class DeleteStorageTool implements McpToolDefinition<Input> {
  readonly name = 'delete_storage';
  readonly description =
    'Delete a Storage that no Data Mart references. The saved Credential remains available. Legacy Google BigQuery Storages cannot be deleted. Never delete dependent Data Marts to bypass this restriction.';
  readonly zodSchema = storageTargetSchema;
  readonly outputSchema = { storage_id: z.string(), deleted: z.boolean() };
  readonly annotations = {
    title: 'Delete Storage',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new StorageToolMapper();

  constructor(
    @Inject(MCP_STORAGE_MANAGEMENT_FACADE) private readonly storages: McpStorageManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = storageTargetSchema.parse(input);
    await storageToolCall(
      () => this.storages.delete(this.mapper.toActor(context), parsed.storage_id),
      'delete'
    );
    return jsonToolResult({ storage_id: parsed.storage_id, deleted: true });
  }
}
