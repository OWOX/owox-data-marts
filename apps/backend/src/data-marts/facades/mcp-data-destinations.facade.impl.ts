import { BadRequestException, Injectable } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { CreateDataDestinationCommand } from '../dto/domain/create-data-destination.command';
import { DataDestinationCredentialService } from '../services/data-destination-credential.service';
import { PublicOriginService } from '../../common/config/public-origin.service';
import { DataDestinationCredentials } from '../data-destination-types/data-destination-credentials.type';
import { LookerStudioConnectorCredentials } from '../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-credentials.schema';
import { BeginMcpGoogleSheetsSetupService } from '../use-cases/google-oauth/begin-mcp-google-sheets-setup.service';
import {
  McpDataDestinationsFacade,
  McpDestinationType,
  McpListDestinationsRequest,
  McpListDestinationsResponse,
  McpCreateDestinationRequest,
  McpCreateDestinationResponse,
  McpBeginGoogleSheetsSetupRequest,
  McpBeginGoogleSheetsSetupResponse,
} from './mcp-data-destinations.facade';

const DESTINATION_TYPE_MAP: Record<DataDestinationType, McpDestinationType> = {
  [DataDestinationType.GOOGLE_SHEETS]: 'google_sheets',
  [DataDestinationType.LOOKER_STUDIO]: 'looker_studio',
  [DataDestinationType.EMAIL]: 'email',
  [DataDestinationType.SLACK]: 'slack',
  [DataDestinationType.MS_TEAMS]: 'teams',
  [DataDestinationType.GOOGLE_CHAT]: 'google_chat',
};

const REVERSE_DESTINATION_TYPE_MAP: Record<McpDestinationType, DataDestinationType> = {
  google_sheets: DataDestinationType.GOOGLE_SHEETS,
  looker_studio: DataDestinationType.LOOKER_STUDIO,
  email: DataDestinationType.EMAIL,
  slack: DataDestinationType.SLACK,
  teams: DataDestinationType.MS_TEAMS,
  google_chat: DataDestinationType.GOOGLE_CHAT,
};

@Injectable()
export class McpDataDestinationsFacadeImpl implements McpDataDestinationsFacade {
  constructor(
    private readonly listDataDestinationsService: ListDataDestinationsService,
    private readonly createDataDestinationService: CreateDataDestinationService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly publicOriginService: PublicOriginService,
    private readonly beginMcpGoogleSheetsSetupService: BeginMcpGoogleSheetsSetupService
  ) {}

  async listDestinations(
    request: McpListDestinationsRequest
  ): Promise<McpListDestinationsResponse> {
    const items = await this.listDataDestinationsService.run(
      new ListDataDestinationsCommand(request.projectId, request.userId, request.roles)
    );

    return {
      destinations: items
        .filter(destination => destination.availableForUse)
        .map(destination => ({
          id: destination.id,
          name: destination.title,
          type: DESTINATION_TYPE_MAP[destination.type],
          // Report the creator as the owner. The `owners` relation has no stable
          // ordering, so picking one of potentially several owners would be
          // non-deterministic; the creator is a single, stable value.
          owner: destination.createdByUser?.email ?? null,
        })),
    };
  }

  async createDestination(
    request: McpCreateDestinationRequest
  ): Promise<McpCreateDestinationResponse> {
    const dataDestinationType = REVERSE_DESTINATION_TYPE_MAP[request.type];

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

    const command = new CreateDataDestinationCommand(
      request.projectId,
      request.title ?? `${request.type.toUpperCase()} MCP Destination`,
      dataDestinationType,
      request.userId,
      credentials,
      undefined,
      undefined,
      undefined,
      request.roles
    );

    const result = await this.createDataDestinationService.run(command);

    let lookerStudioCredentials:
      | {
          destinationId: string;
          destinationSecretKey: string;
          deploymentUrl: string;
        }
      | undefined = undefined;
    if (request.type === 'looker_studio' && result.credentialId) {
      const credential = await this.dataDestinationCredentialService.getById(result.credentialId);
      if (credential && credential.credentials) {
        lookerStudioCredentials = {
          destinationId: result.id,
          destinationSecretKey:
            (credential.credentials as LookerStudioConnectorCredentials).destinationSecretKey ?? '',
          deploymentUrl: this.publicOriginService.getLookerStudioDeploymentUrl(),
        };
      }
    }

    return {
      id: result.id,
      name: result.title,
      lookerStudioCredentials,
    };
  }

  async beginGoogleSheetsSetup(
    request: McpBeginGoogleSheetsSetupRequest
  ): Promise<McpBeginGoogleSheetsSetupResponse> {
    return this.beginMcpGoogleSheetsSetupService.run(request);
  }
}
