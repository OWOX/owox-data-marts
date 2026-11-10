import { Inject, Injectable } from '@nestjs/common';
import type { McpScope, Role } from '@owox/idp-protocol';
import { z } from 'zod';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../../data-marts/facades/mcp-data-destinations.facade';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { DestinationToolMapper, destinationMutationOutput } from './destination-tool.mapper';
import { destinationToolCall } from './destination-tool-error';

const inputSchema = z
  .object({
    destination_id: z.string().min(1),
    owner_ids: z
      .array(z.string().min(1))
      .max(1000)
      .optional()
      .describe(
        'Replace all owners with these project member IDs. An empty list removes all owners.'
      ),
    context_ids: z
      .array(z.string().min(1))
      .max(1000)
      .optional()
      .describe('Replace all Contexts with these IDs. An empty list removes all Contexts.'),
    available_for_use: z.boolean().optional(),
    available_for_maintenance: z.boolean().optional(),
  })
  .strict()
  .refine(
    input =>
      input.owner_ids !== undefined ||
      input.context_ids !== undefined ||
      input.available_for_use !== undefined ||
      input.available_for_maintenance !== undefined,
    'Supply at least one access field.'
  );
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class SetDestinationAccessTool implements McpToolDefinition<Input> {
  readonly name = 'set_destination_access';
  readonly description =
    'Change Destination owners, Contexts, or sharing. Each supplied list replaces the current list. Omitted fields stay unchanged. Requires the corresponding management permissions. Keep the existing entries that the user still needs.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = destinationMutationOutput;
  readonly annotations = {
    title: 'Set Destination Access',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly mapper = new DestinationToolMapper();

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE) private readonly destinations: McpDataDestinationsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): Input {
    return inputSchema.parse(input);
  }

  async handler(input: Input, context: McpAuthContext): Promise<McpToolResult> {
    const value = this.parseInput(input);
    const result = await destinationToolCall(() =>
      this.destinations.setDestinationAccess(this.mapper.toActor(context), {
        destinationId: value.destination_id,
        ...(value.owner_ids !== undefined && { ownerIds: value.owner_ids }),
        ...(value.context_ids !== undefined && { contextIds: value.context_ids }),
        ...(value.available_for_use !== undefined && { availableForUse: value.available_for_use }),
        ...(value.available_for_maintenance !== undefined && {
          availableForMaintenance: value.available_for_maintenance,
        }),
      })
    );
    return jsonToolResult(
      this.mapper.toMutation(result, context.projectId, this.publicOriginService.getPublicOrigin())
    );
  }
}
