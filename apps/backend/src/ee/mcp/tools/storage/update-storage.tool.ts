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
import { updateStorageSchema, storageOutputSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof updateStorageSchema>;

@Injectable()
export class UpdateStorageTool implements McpToolDefinition<Input> {
  readonly name = 'update_storage';
  readonly description =
    'Update the supplied Storage title, configuration, or Credential. Omitted fields stay unchanged. Storage types cannot change. Legacy BigQuery titles and project IDs stay unchanged. Use saved Credential IDs only.';
  readonly zodSchema = updateStorageSchema;
  readonly outputSchema = storageOutputSchema;
  readonly annotations = {
    title: 'Update Storage',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'editor';
  private readonly mapper = new StorageToolMapper();

  constructor(
    @Inject(MCP_STORAGE_MANAGEMENT_FACADE) private readonly storages: McpStorageManagementFacade
  ) {}

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = updateStorageSchema.parse(input);
    const storage = await storageToolCall(
      () =>
        this.storages.update(this.mapper.toActor(context), parsed.storage_id, {
          ...(parsed.title !== undefined ? { title: parsed.title } : {}),
          ...(parsed.configuration !== undefined ? { configuration: parsed.configuration } : {}),
          ...(parsed.credential_id !== undefined ? { credentialId: parsed.credential_id } : {}),
        }),
      'update'
    );
    return jsonToolResult(this.mapper.toStorage(storage));
  }
}
