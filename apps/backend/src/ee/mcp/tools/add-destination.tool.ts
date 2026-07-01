import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { McpScope } from '@owox/idp-protocol';
import {
  MCP_DATA_DESTINATIONS_FACADE,
  MCP_DESTINATION_TYPES,
  type McpDataDestinationsFacade,
} from '../../../data-marts/facades/mcp-data-destinations.facade';
import type { McpAuthContext } from '../auth/mcp-auth-context';
import type { McpToolDefinition, McpToolResult } from './mcp-tool.definition';

const CREATE_ROLES = ['editor', 'admin'];

const inputSchema = z
  .object({
    destination_type: z
      .enum(MCP_DESTINATION_TYPES)
      .describe(
        'The type of destination to connect/create (e.g. google_sheets, looker_studio, email, slack, teams, google_chat).'
      ),
    redirect_back: z
      .string()
      .url()
      .optional()
      .describe(
        'URL to redirect the user back after browser OAuth (only relevant for google_sheets).'
      ),
    title: z.string().optional().describe('Optional custom name for the new destination.'),
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
    'for google_sheets, returns a setup link that starts Google OAuth and creates the ' +
    'destination automatically once the user approves (no emails needed); ' +
    'for email-based types (email, slack, teams, google_chat), creates the destination ' +
    'directly and requires the emails parameter — no OAuth involved; ' +
    'for looker_studio (pull-based connector), creates the destination directly and returns ' +
    'connector credentials — no OAuth, no emails needed. Requires Editor or Admin role on the project.';
  readonly zodSchema = inputSchema.shape;
  readonly outputSchema = {
    authorization_url: z.string().optional(),
    instructions: z.string(),
    destination_id: z.string().optional(),
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
    private readonly destinations: McpDataDestinationsFacade
  ) {}

  parseInput(input: unknown): AddDestinationInput {
    return inputSchema.parse(input);
  }

  async handler(input: AddDestinationInput, context: McpAuthContext): Promise<McpToolResult> {
    const parsed = this.parseInput(input);
    const destinationType = parsed.destination_type;
    const humanType = this.getHumanReadableType(destinationType);

    if (!context.roles.some(role => CREATE_ROLES.includes(role))) {
      const errorContent = {
        error: 'PERMISSION_DENIED',
        instructions:
          'Creating destinations requires the Editor or Admin role on this project. ' +
          'Ask a project admin to grant you Editor access, or ask them to create this destination.',
      };
      return {
        structuredContent: errorContent,
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorContent, null, 2),
          },
        ],
      };
    }

    const emailBasedTypes: string[] = ['email', 'slack', 'teams', 'google_chat'];

    // For email-based destinations, validate that emails list is provided
    if (emailBasedTypes.includes(destinationType)) {
      if (!parsed.emails || parsed.emails.length === 0) {
        const errorContent = {
          error: 'MISSING_EMAILS',
          instructions: `The 'emails' parameter is required for creating a ${humanType} destination. Please ask the user to specify one or more email addresses first before calling this tool.`,
        };
        return {
          structuredContent: errorContent,
          content: [
            {
              type: 'text',
              text: JSON.stringify(errorContent, null, 2),
            },
          ],
        };
      }

      const created = await this.destinations.createDestination({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        type: destinationType,
        title: parsed.title,
        emails: parsed.emails,
      });

      const structuredContent = {
        destination_id: created.id,
        instructions: `Successfully connected ${humanType} destination "${created.name}" for report delivery.`,
      };

      return {
        structuredContent,
        content: [
          {
            type: 'text',
            text: JSON.stringify(structuredContent, null, 2),
          },
        ],
      };
    }

    // Direct creation for Looker Studio (no browser OAuth popup is needed)
    if (destinationType === 'looker_studio') {
      const created = await this.destinations.createDestination({
        projectId: context.projectId,
        userId: context.userId,
        roles: context.roles,
        type: destinationType,
        title: parsed.title,
      });

      const creds = created.lookerStudioCredentials;
      const instructions = `Looker Studio Destination has been successfully enabled!
Please copy these credentials and paste them into the OWOX Data Marts Looker Studio connector interface:
- Connector Deployment URL: ${creds?.deploymentUrl ?? ''}
- Destination ID (Client ID): ${creds?.destinationId ?? created.id}
- Destination Secret Key (Token): ${creds?.destinationSecretKey ?? ''}`;

      const structuredContent = {
        destination_id: created.id,
        instructions,
      };

      return {
        structuredContent,
        content: [
          {
            type: 'text',
            text: JSON.stringify(structuredContent, null, 2),
          },
        ],
      };
    }

    if (destinationType === 'google_sheets') {
      // One link that goes straight into Google's OAuth consent screen and creates the
      // destination automatically once the user approves — no intermediate OWOX page,
      // no OWOX login required in that browser.
      const { setupUrl } = await this.destinations.beginGoogleSheetsSetup({
        projectId: context.projectId,
        userId: context.userId,
        title: parsed.title,
        redirectBack: parsed.redirect_back,
      });

      const structuredContent = {
        authorization_url: setupUrl,
        instructions:
          'Open this link in your browser. It will take you straight to Google to grant access — ' +
          'no OWOX sign-in or extra clicks required. Your Google Sheets destination will be created ' +
          'automatically once you approve.',
      };

      return {
        structuredContent,
        content: [
          {
            type: 'text',
            text: JSON.stringify(structuredContent, null, 2),
          },
        ],
      };
    }

    // Unreachable for the current MCP_DESTINATION_TYPES (email-based, looker_studio, and
    // google_sheets above already cover all of them exhaustively) — guards against a
    // future destination type being added to the enum without a matching branch here.
    const errorContent = {
      error: 'UNSUPPORTED_DESTINATION_TYPE',
      instructions: `No creation flow is implemented for destination type '${destinationType}'.`,
    };
    return {
      structuredContent: errorContent,
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorContent, null, 2),
        },
      ],
    };
  }

  private getHumanReadableType(type: string): string {
    switch (type) {
      case 'google_sheets':
        return 'Google Sheets';
      case 'slack':
        return 'Slack';
      case 'email':
        return 'Email';
      case 'teams':
        return 'Microsoft Teams';
      case 'looker_studio':
        return 'Looker Studio';
      case 'google_chat':
        return 'Google Chat';
      default:
        return type;
    }
  }
}
