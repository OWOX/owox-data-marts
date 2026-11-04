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
import { storageTargetSchema, storageValidationOutputSchema } from './storage.schemas';
import { storageToolCall } from './storage-tool-error';

type Input = z.infer<typeof storageTargetSchema>;

@Injectable()
export class ValidateStorageAccessTool implements McpToolDefinition<Input> {
  readonly name = 'validate_storage_access';
  readonly description =
    'Validate the saved Storage configuration and Credential. Requires permission to use the Storage. Returns a safe status and guidance without provider diagnostics.';
  readonly zodSchema = storageTargetSchema;
  readonly outputSchema = storageValidationOutputSchema;
  readonly annotations = {
    title: 'Validate Storage Access',
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
    const parsed = storageTargetSchema.parse(input);
    const result = await storageToolCall(
      () => this.storages.validate(this.mapper.toActor(context), parsed.storage_id),
      'validate'
    );
    return jsonToolResult({
      storage_id: parsed.storage_id,
      valid: result.valid,
      state: result.state,
      message: result.message,
    });
  }
}
