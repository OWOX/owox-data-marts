import { Injectable } from '@nestjs/common';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { toMcpDestinationType } from './mcp-destination-type';
import {
  McpDataDestinationsFacade,
  McpListDestinationsRequest,
  McpListDestinationsResponse,
} from './mcp-data-destinations.facade';

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
          type: toMcpDestinationType(destination.type),
          // Report the creator as the owner. The `owners` relation has no stable
          // ordering, so picking one of potentially several owners would be
          // non-deterministic; the creator is a single, stable value.
          owner: destination.createdByUser?.email ?? null,
        })),
    };
  }
}
