import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope, Role } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../../common/config/public-origin.service';
import {
  GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
  MCP_CREDENTIALS_FACADE,
  type McpCredentialsFacade,
} from '../../../../data-marts/credentials/facades/mcp-credentials.facade';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../../data-marts/facades/mcp-data-destinations.facade';
import {
  MCP_DESTINATION_TYPES,
  MCP_NON_CREATABLE_DESTINATION_TYPES,
} from '../../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from '../mcp-tool.definition';
import { buildDataDestinationsUiPath } from '../data-mart-ui-path';
import { LOOKER_STUDIO_DESTINATION_GUIDE_URL } from '../mcp-docs-urls';
import { joinPublicOrigin } from '../mcp-public-url.util';
import { CredentialToolMapper } from '../credential/credential-tool.mapper';
import { driveFolderUrlSchema } from './destination-tool.mapper';
import { destinationToolCall } from './destination-tool-error';

const MCP_CHANNEL_EMAIL_TYPES = ['email', 'slack', 'teams', 'google_chat'];

function toDisplayLabel(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const inputSchema = z
  .object({
    destination_type: z
      .enum(MCP_DESTINATION_TYPES)
      .exclude(MCP_NON_CREATABLE_DESTINATION_TYPES)
      .describe('The Destination type to create.'),
    title: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Name the Destination for its team, tool, or channel. A Destination can serve multiple Reports. ' +
          'Keep this title for creation after browser Credential setup.'
      ),
    emails: z
      .array(z.string().email())
      .optional()
      .describe(
        'Supply target email addresses. This field is required for email, slack, teams and Google Chat delivery through channel email. Do not combine emails with credential_id.'
      ),
    drive_folder_url: driveFolderUrlSchema
      .optional()
      .describe(
        'Google Drive folder URL for new spreadsheets. Service accounts require a Shared Drive folder with permission to create files. Google sign-in requires access for both the connected account and OWOX. Keep this URL for creation after Credential setup.'
      ),
    credential_id: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Select the ID of a saved Credential that you can use. This field supports google_sheets and google_chat webhook delivery. Get the ID from list_credentials or from completed browser setup. Never send a key, token, webhook URL or service-account JSON.'
      ),
  })
  .strict()
  .refine(
    data => data.drive_folder_url === undefined || data.destination_type === 'google_sheets',
    {
      message: 'Only Google Sheets destinations support a Drive folder.',
      path: ['drive_folder_url'],
    }
  )
  .refine(
    data => !data.credential_id || ['google_sheets', 'google_chat'].includes(data.destination_type),
    {
      message: 'credential_id is supported only for google_sheets and google_chat.',
      path: ['credential_id'],
    }
  )
  .refine(data => !data.credential_id || data.emails === undefined, {
    message: 'Do not combine emails with credential_id.',
    path: ['emails'],
  })
  .refine(
    data =>
      !MCP_CHANNEL_EMAIL_TYPES.includes(data.destination_type) ||
      (data.destination_type === 'google_chat' && !!data.credential_id) ||
      (data.emails && data.emails.length > 0),
    {
      message:
        'Supply at least one email address for email, slack, teams, or Google Chat channel-email delivery.',
      path: ['emails'],
    }
  );

type AddDestinationInput = z.infer<typeof inputSchema>;

@Injectable()
export class AddDestinationTool implements McpToolDefinition<AddDestinationInput> {
  readonly name = 'add_destination';
  readonly description =
    'Create an unshared Destination for report delivery. Direct creation returns destination_id.\n\n' +
    'For google_sheets, supply a saved credential_id that you can use. ' +
    'Without credential_id, this tool starts browser Credential setup and returns authorization_url and setup_id. ' +
    'That call does not create a Destination. ' +
    'The user must sign in with the OWOX account that connected MCP and must belong to this project. ' +
    'The browser form title names the Credential.\n\n' +
    'Call get_credential_setup_status with setup_id. Repeat while the status is pending. ' +
    'When completed, call add_destination with the exact credential_id, requested title, and drive_folder_url if supplied.\n\n' +
    'On folder access errors with a service account, grant it permission to create files in the Shared Drive folder. ' +
    'On folder access errors with Google sign-in, select the folder through the OWOX Picker with the connected account.\n\n' +
    'For email, slack, and teams, supply emails. ' +
    'For google_chat, supply emails for channel-email delivery or credential_id for webhook delivery. ' +
    'Never send Credential values or a secret webhook URL.\n\n' +
    'For looker_studio, omit emails and credential_id. This creates a Destination without browser setup. ' +
    'The user must copy connector credentials from OWOX. The tool never returns the Destination Secret Key. For the complete workflow, call get_guide with topic storages_destinations.';
  readonly zodSchema = inputSchema;
  readonly outputSchema = {
    authorization_url: z.string().optional(),
    setup_id: z
      .string()
      .optional()
      .describe(
        'Use this ID with get_credential_setup_status to identify the exact saved Credential.'
      ),
    instructions: z.string(),
    destination_id: z
      .string()
      .optional()
      .describe(
        'The tool returns destination_id when it creates a destination directly. This includes google_sheets with credential_id. ' +
          'The initial Credential setup call does not return a destination ID. After setup, call add_destination with the exact credential_id.'
      ),
    destination_url: z
      .string()
      .optional()
      .describe(
        'Open the created destination in OWOX. The tool returns this URL only when it creates a destination.'
      ),
  };
  readonly annotations = {
    title: 'Add Destination',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
  readonly requiredRole: Role = 'viewer';
  private readonly credentialMapper = new CredentialToolMapper();

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE)
    private readonly destinations: McpDataDestinationsFacade,
    private readonly publicOriginService: PublicOriginService,
    @Inject(MCP_CREDENTIALS_FACADE) private readonly credentials: McpCredentialsFacade
  ) {}

  parseInput(input: unknown): AddDestinationInput {
    return inputSchema.parse(input);
  }

  async handler(input: AddDestinationInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const destinationType = parsed.destination_type;
    const humanType = toDisplayLabel(destinationType);
    const title = parsed.title ?? humanType;

    if (parsed.credential_id || MCP_CHANNEL_EMAIL_TYPES.includes(destinationType)) {
      const created = await destinationToolCall(() =>
        this.destinations.createDestination({
          projectId: context.projectId,
          userId: context.userId,
          roles: context.roles,
          type: destinationType,
          title,
          ...(parsed.drive_folder_url !== undefined && { folderUrl: parsed.drive_folder_url }),
          ...(parsed.credential_id
            ? { credentialId: parsed.credential_id }
            : { emails: parsed.emails }),
        })
      );

      return jsonToolResult({
        destination_id: created.id,
        destination_url: joinPublicOrigin(
          this.publicOriginService.getPublicOrigin(),
          buildDataDestinationsUiPath(context.projectId, created.id)
        ),
        instructions: `Created ${humanType} Destination "${created.name}" for report delivery.`,
      });
    }

    if (destinationType === 'looker_studio') {
      const created = await destinationToolCall(() =>
        this.destinations.createDestination({
          projectId: context.projectId,
          userId: context.userId,
          roles: context.roles,
          type: destinationType,
          title,
        })
      );

      const instructions = `Created Looker Studio Destination "${created.name}".
Ask the user to open destination_url in OWOX.
They must copy Deployment URL, Destination ID, and Destination Secret Key into the Looker Studio connector.
Share this setup guide: ${LOOKER_STUDIO_DESTINATION_GUIDE_URL}`;

      return jsonToolResult({
        destination_id: created.id,
        destination_url: joinPublicOrigin(
          this.publicOriginService.getPublicOrigin(),
          buildDataDestinationsUiPath(context.projectId, created.id)
        ),
        instructions,
      });
    }

    if (destinationType === 'google_sheets') {
      const setup = await destinationToolCall(() =>
        this.credentials.startSetup(this.credentialMapper.toActor(context), {
          definitionId: GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
        })
      );

      return jsonToolResult({
        authorization_url: this.credentialMapper.toSetupUrl(
          context.projectId,
          setup.id,
          this.publicOriginService.getPublicOrigin()
        ),
        setup_id: setup.id,
        instructions:
          'Open authorization_url in your browser. Sign in to OWOX with the same account that connected MCP. ' +
          'You must be a member of this project. Complete the Google Sheets Credential form. ' +
          'The form title names the Credential. This call does not create a destination.\n\n' +
          'Call get_credential_setup_status with setup_id. Use wait_seconds to wait up to 25 seconds. ' +
          'If the status is pending, repeat the status call as needed. ' +
          'If the status is completed, use its exact credential_id. ' +
          `After completion, call add_destination again with destination_type "google_sheets", that credential_id and title ${JSON.stringify(title)}. ` +
          (parsed.drive_folder_url
            ? `Include drive_folder_url ${JSON.stringify(parsed.drive_folder_url)}. ` +
              'For Google sign-in, OWOX must already have access to this folder with the connected account. ' +
              'If folder access fails, select it through the OWOX Picker with that account. '
            : '') +
          '\n\n' +
          'If setup is cancelled, expired or missing, ask for the saved Credential ID shown on the page. ' +
          'Verify that ID with get_credential before reusing it. ' +
          'If unavailable, use list_credentials and ask the user to confirm the provider and title. ' +
          'Start a new request only if no suitable Credential is confirmed.',
      });
    }

    throw new BadRequestException(
      `No creation flow is implemented for destination type '${destinationType}'.`
    );
  }
}
