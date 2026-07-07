import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import { PublicOriginService } from '../../../common/config/public-origin.service';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  type McpDataDestinationsFacade,
} from '../../../data-marts/facades/mcp-data-destinations.facade';
import { MCP_DESTINATION_TYPES } from '../../../data-marts/facades/mcp-destination-type';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import { jsonToolResult, type McpToolDefinition, type McpToolResult } from './mcp-tool.definition';
import { buildConnectGoogleSheetsUiPath } from './mcp-flow-ui-path';
import { joinPublicOrigin } from './mcp-public-url.util';

const EMAIL_BASED_TYPES = ['email', 'slack', 'teams', 'google_chat'];

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
      .enum(MCP_DESTINATION_TYPES)
      .describe(
        'The type of destination to connect/create (e.g. google_sheets, looker_studio, email, slack, teams, google_chat).'
      ),
    title: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe(
        'Optional custom name for the new destination itself (e.g. "Marketing Team Google ' +
          'Sheet"), NOT the name of the report you may be creating this destination for. A ' +
          'destination is a standalone, reusable connection target — once created, it can be ' +
          'reused by any number of future reports, so name it after what it represents (the ' +
          'team, tool, or channel it points to), not after the specific report that prompted ' +
          'you to create it. Does NOT apply to google_sheets: that page never pre-fills its ' +
          "name from this parameter — the user always sets it directly in the form, so it's " +
          'ignored there. Applies to email, slack, teams, google_chat, and looker_studio only.'
      ),
    emails: z
      .array(z.string().email())
      .optional()
      .describe(
        'Mandatory list of target email addresses/delivery targets. This parameter is STRICTLY REQUIRED for email-based types (email, slack, teams, google_chat). Do NOT attempt to call this tool for email-based types without asking the user for these email addresses first.'
      ),
  })
  .strict();

type AddDestinationInput = z.infer<typeof inputSchema>;

@Injectable()
export class AddDestinationTool implements McpToolDefinition<AddDestinationInput> {
  readonly name = 'add_destination';
  readonly description =
    'Adds a report-delivery destination. Behavior depends on destination_type: ' +
    'for google_sheets, returns a link to a simple in-app "Connect Google Sheets" page — ' +
    'the user must be signed in to OWOX (prompted if not) and a member of this project ' +
    '(asked to request access if not); on the page they click to start Google OAuth, and ' +
    'the destination is created automatically as soon as they approve access — no extra ' +
    'save step; the person who completed it can use it in their own reports right away, ' +
    'but it starts unshared for everyone else on the project — another project member ' +
    'cannot use it until a human shares it — this call does NOT return a destination_id, ' +
    'because the destination does not exist yet, and its name is not known in advance ' +
    'either (the user sets it directly in the form, this tool never pre-fills it); ' +
    'after the user confirms they completed it, ' +
    'call list_destinations and filter to google_sheets entries whose ' +
    'connectedGoogleAccount matches who the user expected — never pick by createdAt/recency, ' +
    'another destination may be created concurrently by someone else; if more than one ' +
    'entry still matches, ask the user which one they mean instead of guessing; ' +
    'for email-based types (email, slack, teams, google_chat), creates the destination ' +
    'directly and requires the emails parameter — no OAuth involved, destination_id is ' +
    'returned immediately; ' +
    'for looker_studio (pull-based connector), creates the destination directly and returns ' +
    'destination_id immediately — no OAuth, no emails needed; the connector credentials ' +
    '(including the Destination Secret Key/Token) are never sent through MCP/chat — the ' +
    'user must open the destination in the OWOX Data Marts UI to copy them.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    authorization_url: z.string().optional(),
    instructions: z.string(),
    destination_id: z
      .string()
      .optional()
      .describe(
        'The new destination id. Present for every destination_type EXCEPT google_sheets ' +
          '(returned immediately, before any external action is needed). For google_sheets, ' +
          'this is absent — use list_destinations after the user confirms setup instead.'
      ),
  };
  readonly annotations = {
    title: 'Add Destination',
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  };
  readonly requiredScopes: McpScope[] = ['mcp:write'];

  constructor(
    @Inject(MCP_DATA_DESTINATIONS_FACADE)
    private readonly destinations: McpDataDestinationsFacade,
    private readonly publicOriginService: PublicOriginService
  ) {}

  parseInput(input: unknown): AddDestinationInput {
    return inputSchema
      .refine(
        data =>
          !EMAIL_BASED_TYPES.includes(data.destination_type) ||
          (data.emails && data.emails.length > 0),
        {
          message:
            "The 'emails' parameter is required for creating email-based destination types (email, slack, teams, google_chat). " +
            'Please ask the user to specify one or more email addresses first before calling this tool.',
          path: ['emails'],
        }
      )
      .parse(input);
  }

  async handler(input: AddDestinationInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const destinationType = parsed.destination_type;
    const humanType = toDisplayLabel(destinationType);
    const title = parsed.title ?? humanType;

    if (EMAIL_BASED_TYPES.includes(destinationType)) {
      const created = await this.destinations.createDestination({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        type: destinationType,
        title,
        emails: parsed.emails,
      });

      return jsonToolResult({
        destination_id: created.id,
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
Open Data Destinations in OWOX Data Marts and edit "${created.name}" to copy its connector credentials (Deployment URL, Destination ID, and Destination Secret Key) into the OWOX Data Marts Data Studio connector interface.`;

      return jsonToolResult({
        destination_id: created.id,
        instructions,
      });
    }

    if (destinationType === 'google_sheets') {
      // A link into a normal, authenticated, project-scoped in-app page (ConnectFlowLayout /
      // ConnectGoogleSheetsPage) — no token minted, no unauthenticated backend route. The
      // user must already be signed in to OWOX and a member of this project; the existing
      // route guards (ProjectIdGuard/ProjectRoleGuard) handle sign-in prompts, project
      // switching, and access requests. Deliberately no title/name is passed through the
      // URL — the page never pre-fills its Title field from a query param (an unverified
      // value from a link isn't proof of what the user actually wants), so the agent can
      // never predict the final name in advance; the user always sets it in the form.
      const setupUrl = joinPublicOrigin(
        this.publicOriginService.getPublicOrigin(),
        buildConnectGoogleSheetsUiPath(context.projectId)
      );

      return jsonToolResult({
        authorization_url: setupUrl,
        instructions:
          'Open this link in your browser. You must be signed in to OWOX with the same account ' +
          'that connected MCP and be a member of this project; otherwise MCP will not be ' +
          'able to find the unshared destination afterward. If needed, you will be prompted ' +
          'to sign in or request project access. It opens a simple "Connect Google Sheets" ' +
          'page — click "Connect with ' +
          'Google" there. Your Google Sheets destination is created automatically as soon ' +
          'as you approve access, no extra save step. You can use it in your own reports ' +
          'right away, but it starts unshared for everyone else on the project — other ' +
          'project members cannot use it until a human shares it. This response does NOT ' +
          "include a destination_id — it doesn't exist yet. Once the user says they're " +
          'done: call list_destinations, filter to google_sheets entries, and match by ' +
          'connectedGoogleAccount against who the user expected — never pick by createdAt ' +
          'or recency, someone else could create a destination at the same time. Its name ' +
          'is whatever the user set in the form and cannot be predicted in advance. If ' +
          'exactly one entry matches connectedGoogleAccount, use it; if more than one ' +
          'still matches, do not guess — ask the user which one they mean.',
      });
    }

    // Unreachable for the current MCP_DESTINATION_TYPES (email-based, looker_studio, and
    // google_sheets above already cover all of them exhaustively) — guards against a
    // future destination type being added to the enum without a matching branch here.
    throw new BadRequestException(
      `No creation flow is implemented for destination type '${destinationType}'.`
    );
  }
}
