import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
  MCP_CREDENTIALS_FACADE,
  type McpCredentialsFacade,
} from '../../../data-marts/credentials/facades/mcp-credentials.facade';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../data-marts/facades/mcp-data-destinations.facade';
import {
  MCP_DESTINATION_TYPES,
  MCP_NON_CREATABLE_DESTINATION_TYPES,
} from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildDataDestinationsUiPath } from './data-mart-ui-path';
import { LOOKER_STUDIO_DESTINATION_GUIDE_URL } from './mcp-docs-urls';
import { joinPublicOrigin } from './mcp-public-url.util';
import { CredentialToolMapper } from './credential/credential-tool.mapper';

const MCP_CHANNEL_EMAIL_TYPES = ['email', 'slack', 'teams', 'google_chat'];

/**
 * Plain, mechanical label for a destination type — used both in agent-facing messages and
 * as the default destination name when the caller doesn't provide a title. No curated
 * per-type mapping to maintain: "google_chat" -> "Google Chat", "teams" -> "Teams", etc. —
 * just enough to avoid an all-caps or "_"-ridden name, nothing more.
 */
function toDisplayLabel(type: string): string {
  return type
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const inputSchema = z
  .object({
    destination_type: z
      // Subtracted rather than listed out, so the creatable set follows the vocabulary instead
      // of being a second copy of it that drifts when a type is added.
      .enum(MCP_DESTINATION_TYPES)
      .exclude(MCP_NON_CREATABLE_DESTINATION_TYPES)
      .describe(
        'The type of destination to connect/create (e.g. google_sheets, looker_studio, email, slack, teams, google_chat).'
      ),
    title: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Supply an optional name for the destination, such as "Marketing Team Google Sheet". ' +
          'The destination is a separate connection that any number of future reports can reuse. ' +
          'Name it for the team, tool or channel it represents. Do not name it for the report that requires its creation. ' +
          'This title applies to destinations that the tool creates directly.\n\n' +
          'For google_sheets without credential_id, the first call starts Credential setup only. ' +
          'Keep this title for the follow-up add_destination call. The browser form title names the Credential.'
      ),
    emails: z
      .array(z.string().email())
      .optional()
      .describe(
        'Supply target email addresses. This field is required for email, slack, teams and Google Chat delivery through channel email. Do not combine emails with credential_id.'
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
        "The 'emails' parameter is required for email, slack, teams, and channel-email Google Chat destinations created through MCP. " +
        'Please ask the user to specify one or more email addresses first before calling this tool.',
      path: ['emails'],
    }
  );

type AddDestinationInput = z.infer<typeof inputSchema>;

@Injectable()
export class AddDestinationTool implements McpToolDefinition<AddDestinationInput> {
  readonly name = 'add_destination';
  readonly description =
    'Create a destination for report delivery. The behavior depends on destination_type.\n\n' +
    'If you supply credential_id, the tool creates a google_sheets destination or a google_chat destination for webhook delivery. ' +
    'You must have permission to use the saved Credential. The tool returns destination_id. New destinations start unshared. ' +
    'Never send Credential values or a secret webhook URL.\n\n' +
    'For google_sheets without credential_id, the tool starts browser setup for a Google Sheets Credential. ' +
    'It returns authorization_url and setup_id. This call does not create a destination. ' +
    'The user must be signed in to OWOX with the same account that connected MCP. ' +
    'The user must be a member of this project. The browser title names the Credential.\n\n' +
    'After browser setup, call get_credential_setup_status with setup_id. ' +
    'If the status is pending, repeat the status call as needed. ' +
    'If the status is completed, call add_destination again with its exact credential_id and the requested destination title. ' +
    'This follow-up creates the destination and returns destination_id. Its title names the destination.\n\n' +
    'For email, slack and teams, the tool creates the destination directly and requires emails. ' +
    'For google_chat without credential_id, the tool uses channel-email delivery and requires emails. ' +
    'These operations do not use OAuth. The tool returns destination_id immediately.\n\n' +
    'For looker_studio, the tool creates a destination for a pull-based connector. ' +
    'The tool returns destination_id immediately. This operation does not use OAuth or require emails. ' +
    'The tool never sends connector credentials, including the Destination Secret Key/Token, through MCP or chat. ' +
    'The user must open the destination in OWOX Data Marts to copy those credentials.';
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
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];
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
      const created = await this.destinations.createDestination({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        type: destinationType,
        title,
        ...(parsed.credential_id
          ? { credentialId: parsed.credential_id }
          : { emails: parsed.emails }),
      });

      return jsonToolResult({
        destination_id: created.id,
        destination_url: joinPublicOrigin(
          this.publicOriginService.getPublicOrigin(),
          buildDataDestinationsUiPath(context.projectId, created.id)
        ),
        instructions: `Successfully connected ${humanType} destination "${created.name}" for report delivery.`,
      });
    }

    // Direct creation for Looker Studio (no browser OAuth popup is needed)
    if (destinationType === 'looker_studio') {
      const created = await this.destinations.createDestination({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        type: destinationType,
        title,
      });

      // The Destination Secret Key (Token) must never be sent through MCP/chat, even for a
      // destination just created in this same call — it's a live credential, not a display
      // value, so the user retrieves it themselves from the OWOX Data Marts UI.
      const instructions = `Data Studio Destination "${created.name}" has been successfully enabled!
Open Data Destinations in OWOX Data Marts and edit "${created.name}" to copy its connector credentials (Deployment URL, Destination ID, and Destination Secret Key) into the OWOX Data Marts Data Studio connector interface.
Share the setup guide with the user — it walks through every step: ${LOOKER_STUDIO_DESTINATION_GUIDE_URL}`;

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
      const setup = await this.credentials.startSetup(this.credentialMapper.toActor(context), {
        definitionId: GOOGLE_SHEETS_OAUTH_DEFINITION_ID,
      });

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
          'The title in this follow-up call names the destination.\n\n' +
          'If setup is cancelled or expired, start a new request.',
      });
    }

    // Unreachable for everything this tool offers: email-based, looker_studio and
    // google_sheets above cover the vocabulary minus MCP_NON_CREATABLE_DESTINATION_TYPES, and
    // an excluded type is refused by the schema before it ever reaches here. Guards against a
    // future destination type being added to the enum without a matching branch.
    throw new BadRequestException(
      `No creation flow is implemented for destination type '${destinationType}'.`
    );
  }
}
