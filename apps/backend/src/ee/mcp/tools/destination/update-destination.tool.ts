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
import {
  DestinationToolMapper,
  driveFolderUrlSchema,
  destinationDetailsOutput,
} from './destination-tool.mapper';
import { destinationToolCall } from './destination-tool-error';

const inputSchema = z
  .object({
    destination_id: z.string().min(1),
    title: z.string().trim().min(1).max(255).optional(),
    emails: z
      .array(z.string().email())
      .min(1)
      .optional()
      .describe(
        'Recipients for email, slack, teams, or google_chat channel-email delivery. Do not combine with credential_id.'
      ),
    drive_folder_url: driveFolderUrlSchema
      .nullable()
      .optional()
      .describe(
        'Google Drive folder URL for new spreadsheets. Service accounts require a Shared Drive folder with permission to create files. Google sign-in requires access for both the connected account and OWOX. Use null to clear it.'
      ),
    credential_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Saved Credential for google_sheets. For google_chat, use a webhook Credential. Never send secret values.'
      ),
  })
  .strict()
  .refine(
    input =>
      input.title !== undefined ||
      input.emails !== undefined ||
      input.drive_folder_url !== undefined ||
      input.credential_id !== undefined,
    'Supply at least one field to update.'
  )
  .refine(
    input => input.emails === undefined || input.credential_id === undefined,
    'Do not combine emails with credential_id.'
  );
type Input = z.infer<typeof inputSchema>;

@Injectable()
export class UpdateDestinationTool implements McpToolDefinition<Input> {
  readonly name = 'update_destination';
  readonly description =
    'Update Destination settings. For Google Chat, emails replaces webhook delivery, and credential_id replaces saved recipients with webhook delivery. ' +
    'Changing the Google account can clear an omitted Drive folder. ' +
    'On folder access errors with a service account, grant it permission to create files in the Shared Drive folder. ' +
    'On folder access errors with Google sign-in, select the folder through the OWOX Picker with the connected account.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = destinationDetailsOutput;
  readonly annotations = {
    title: 'Update Destination',
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: true,
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
    const inputValue = this.parseInput(input);
    const result = await destinationToolCall(() =>
      this.destinations.updateDestination(this.mapper.toActor(context), {
        destinationId: inputValue.destination_id,
        ...(inputValue.title !== undefined && { title: inputValue.title }),
        ...(inputValue.emails !== undefined && { emails: inputValue.emails }),
        ...(inputValue.drive_folder_url !== undefined && {
          folderUrl: inputValue.drive_folder_url,
        }),
        ...(inputValue.credential_id !== undefined && { credentialId: inputValue.credential_id }),
      })
    );
    return jsonToolResult(
      this.mapper.toDetails(result, context.projectId, this.publicOriginService.getPublicOrigin())
    );
  }
}
