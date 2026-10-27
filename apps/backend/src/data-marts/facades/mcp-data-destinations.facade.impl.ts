import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { DataDestinationCredential } from '../entities/data-destination-credential.entity';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import { DestinationCredentialBindingService } from '../data-destination-types/destination-credential-binding.service';
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
  private readonly logger = new Logger(McpDataDestinationsFacadeImpl.name);

  constructor(
    private readonly listDataDestinationsService: ListDataDestinationsService,
    private readonly createDataDestinationService: CreateDataDestinationService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly destinationCredentials: DestinationCredentialBindingService
  ) {}

  async listDestinations(
    request: McpListDestinationsRequest
  ): Promise<McpListDestinationsResponse> {
    const items = await this.listDataDestinationsService.run(
      new ListDataDestinationsCommand(request.projectId, request.userId, request.roles)
    );

    const connectedGoogleAccountByDestinationId = await this.fetchConnectedGoogleAccounts(
      items,
      request
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
        connectedGoogleAccount: connectedGoogleAccountByDestinationId.get(destination.id) ?? null,
        createdAt: destination.createdAt.toISOString(),
      })),
    };
  }

  /**
   * For google_sheets destinations, resolves which Google account actually completed
   * OAuth consent — distinct from the OWOX `owner`/creator, and the only way to notice
   * a mismatch after the MCP-driven Connect Google Sheets page finishes setup.
   */
  private async fetchConnectedGoogleAccounts(
    destinations: Array<{ id: string; type: DataDestinationType; credentialId?: string | null }>,
    { projectId, userId, roles }: McpListDestinationsRequest
  ): Promise<Map<string, string | null>> {
    const sheetsDestinations = destinations.filter(
      destination => destination.type === DataDestinationType.GOOGLE_SHEETS
    );

    let bound: ReadonlySet<string>;
    let summaries: ReadonlyMap<string, DestinationCredentialSummary>;
    let credentialsById: Map<string, DataDestinationCredential>;
    try {
      bound = await this.destinationCredentials.findBoundDestinationIds(
        projectId,
        sheetsDestinations.map(destination => destination.id)
      );
      // A bound Credential's identity needs SEE on it.
      summaries = await this.destinationCredentials.summarizeForDestinations({
        projectId,
        userId,
        roles,
        destinations: sheetsDestinations.filter(destination => bound.has(destination.id)),
      });
      // A bound Destination never falls back to its old row, even once its Credential is deleted.
      const credentialIds = sheetsDestinations
        .filter(destination => !bound.has(destination.id) && destination.credentialId)
        .map(destination => destination.credentialId as string);
      credentialsById = await this.dataDestinationCredentialService.getByIds(
        credentialIds,
        projectId
      );
    } catch (error) {
      this.logger.warn(
        `Failed to batch-fetch Google account identities for ${sheetsDestinations.length} google_sheets destination(s); ` +
          `connectedGoogleAccount will be null for them: ${castError(error).message}`
      );
      return new Map(sheetsDestinations.map(destination => [destination.id, null] as const));
    }

    return new Map(
      sheetsDestinations.map(destination => {
        const email = bound.has(destination.id)
          ? connectedAccount(summaries.get(destination.id))
          : credentialsById.get(destination.credentialId as string)?.identity?.email;
        return [destination.id, email ?? null] as const;
      })
    );
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

/** The account a visible bound Credential connected; a service account completed no OAuth consent. */
function connectedAccount(summary: DestinationCredentialSummary | undefined): string | null {
  return summary?.access === 'visible' && summary.definitionId === GOOGLE_SHEETS_OAUTH_DEFINITION_ID
    ? summary.identity
    : null;
}
