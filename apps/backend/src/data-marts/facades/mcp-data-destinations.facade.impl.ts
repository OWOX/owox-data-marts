import { Injectable } from '@nestjs/common';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import {
  McpDataDestinationsFacade,
  McpDestinationType,
  McpListDestinationsRequest,
  McpListDestinationsResponse,
} from './mcp-data-destinations.facade';

const DESTINATION_TYPE_MAP: Record<DataDestinationType, McpDestinationType> = {
  [DataDestinationType.GOOGLE_SHEETS]: 'google_sheets',
  [DataDestinationType.LOOKER_STUDIO]: 'looker_studio',
  [DataDestinationType.EMAIL]: 'email',
  [DataDestinationType.SLACK]: 'slack',
  [DataDestinationType.MS_TEAMS]: 'teams',
  [DataDestinationType.GOOGLE_CHAT]: 'google_chat',
};

@Injectable()
export class McpDataDestinationsFacadeImpl implements McpDataDestinationsFacade {
  constructor(private readonly listDataDestinationsService: ListDataDestinationsService) {}

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
          // Prefer an assigned owner; fall back to the creator when a
          // destination has no explicit owner.
          owner: (destination.ownerUsers[0] ?? destination.createdByUser)?.email ?? null,
        })),
    };
  }
}
