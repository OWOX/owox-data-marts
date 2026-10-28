import { BadRequestException, Injectable } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import type { DestinationCredentialSummary } from '../data-destination-types/destination-credential-state';
import { GOOGLE_SHEETS_OAUTH_DEFINITION_ID } from '../credentials/services/builtin-credential-definitions';
import { toMcpDestinationType, type McpDestinationType } from './mcp-destination-type';
import {
  McpDataDestinationsFacade,
  McpListDestinationsRequest,
  McpListDestinationsResponse,
  McpCreateDestinationRequest,
  McpCreateDestinationResponse,
} from './mcp-data-destinations.facade';

const REVERSE_DESTINATION_TYPE_MAP: Record<McpDestinationType, DataDestinationType> = {
  google_sheets: DataDestinationType.GOOGLE_SHEETS,
  looker_studio: DataDestinationType.LOOKER_STUDIO,
  excel: DataDestinationType.EXCEL,
  email: DataDestinationType.EMAIL,
  slack: DataDestinationType.SLACK,
  teams: DataDestinationType.MS_TEAMS,
  google_chat: DataDestinationType.GOOGLE_CHAT,
};

@Injectable()
export class McpDataDestinationsFacadeImpl implements McpDataDestinationsFacade {
  constructor(
    private readonly listDataDestinationsService: ListDataDestinationsService,
    private readonly createDataDestinationService: CreateDataDestinationService
  ) {}

  async listDestinations(
    request: McpListDestinationsRequest
  ): Promise<McpListDestinationsResponse> {
    const items = await this.listDataDestinationsService.run(
      new ListDataDestinationsCommand(request.projectId, request.userId, request.roles)
    );

    return {
      destinations: items.map(destination => ({
        id: destination.id,
        name: destination.title,
        type: toMcpDestinationType(destination.type),
        // Report the creator as the owner. The `owners` relation has no stable
        // ordering, so picking one of potentially several owners would be
        // non-deterministic; the creator is a single, stable value.
        owner: destination.createdByUser?.email ?? null,
        connectedGoogleAccount:
          destination.type === DataDestinationType.GOOGLE_SHEETS
            ? connectedAccount(destination.reusableCredential)
            : null,
        createdAt: destination.createdAt.toISOString(),
      })),
    };
  }

  async createDestination(
    request: McpCreateDestinationRequest
  ): Promise<McpCreateDestinationResponse> {
    const dataDestinationType = REVERSE_DESTINATION_TYPE_MAP[request.type];

    // google_sheets never reaches this method — AddDestinationTool intercepts it earlier
    // and routes through the OAuth connect flow instead. Guarded explicitly so a future
    // caller gets a clear error instead of silently falling into the email-credentials
    // branch below and seeing a confusing "Emails list is required" message.
    if (request.type === 'google_sheets') {
      throw new BadRequestException(
        'google_sheets destinations cannot be created directly; use the OAuth connect flow instead'
      );
    }

    let credentials: DataDestinationCredentials;
    if (request.type === 'looker_studio') {
      credentials = {
        type: 'looker-studio-credentials',
      };
    } else {
      if (!request.emails || request.emails.length === 0) {
        throw new BadRequestException('Emails list is required for direct destination creation');
      }
      credentials = {
        type: 'email-credentials',
        to: request.emails as [string, ...string[]],
      };
    }

    const command = new CreateDataDestinationCommand({
      projectId: request.projectId,
      // The MCP tool always resolves a title before calling — this is a defensive
      // backstop only, not a formatting concern this facade should own.
      title: request.title ?? request.type,
      type: dataDestinationType,
      userId: request.userId,
      credentials,
      roles: request.roles,
      // MCP-created destinations start unshared — an agent-created destination shouldn't
      // silently become available to the whole project's reports before a human reviews it.
      availableForUse: false,
    });

    const result = await this.createDataDestinationService.run(command);

    return {
      id: result.id,
      name: result.title,
    };
  }
}

/** The Google account that completed OAuth consent, as the Destinations list names it to the member. */
function connectedAccount(summary: DestinationCredentialSummary | null | undefined): string | null {
  return summary?.definitionId === GOOGLE_SHEETS_OAUTH_DEFINITION_ID
    ? (summary.identity ?? null)
    : null;
}
