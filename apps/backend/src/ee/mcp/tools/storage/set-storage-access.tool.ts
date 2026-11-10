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
import { setStorageAccessSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof setStorageAccessSchema>;

@Injectable()
export class SetStorageAccessTool implements McpToolDefinition<Input> {
  readonly name = 'set_storage_access';
  readonly description =
    'Replace supplied Storage owners or Contexts and update supplied sharing settings. Omitted settings stay unchanged. Owner and sharing changes require their respective permissions. Keep the existing entries that the user still needs.';
  readonly zodSchema = setStorageAccessSchema;
  readonly outputSchema = { storage_id: z.string(), updated: z.boolean() };
  readonly annotations = {
    title: 'Set Storage Access',
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
    const parsed = setStorageAccessSchema.parse(input);
    await storageToolCall(
      () =>
        this.storages.setAccess(this.mapper.toActor(context), parsed.storage_id, {
          ...(parsed.owner_ids !== undefined ? { ownerIds: parsed.owner_ids } : {}),
          ...(parsed.context_ids !== undefined ? { contextIds: parsed.context_ids } : {}),
          ...(parsed.available_for_use !== undefined
            ? { availableForUse: parsed.available_for_use }
            : {}),
          ...(parsed.available_for_maintenance !== undefined
            ? { availableForMaintenance: parsed.available_for_maintenance }
            : {}),
        }),
      'set_access'
    );
    return jsonToolResult({ storage_id: parsed.storage_id, updated: true });
  }
}
