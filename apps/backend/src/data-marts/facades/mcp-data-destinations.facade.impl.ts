import { Injectable } from '@nestjs/common';
import type { AuthorizationContext } from '../../idp';
import { DeleteDataDestinationCommand } from '../dto/domain/delete-data-destination.command';
import { GetDataDestinationCommand } from '../dto/domain/get-data-destination.command';
import { GetDataDestinationImpactCommand } from '../dto/domain/get-data-destination-impact.command';
import type { DataDestinationImpact } from '../dto/domain/data-destination-impact.dto';
import { ListDataDestinationsCommand } from '../dto/domain/list-data-destinations.command';
import { RotateSecretKeyCommand } from '../dto/domain/rotate-secret-key.command';
import type {
  McpCreateDestinationRequest,
  McpCreateDestinationResponse,
  McpDestinationDto,
  McpDestinationMutationResponse,
  McpListDestinationsRequest,
  McpListDestinationsResponse,
  McpSetDestinationAccessRequest,
  McpUpdateDestinationRequest,
} from './mcp-data-destinations.facade';
import { McpDestinationMapper } from '../mappers/mcp-destination.mapper';
import { CreateDataDestinationService } from '../use-cases/create-data-destination.service';
import { DeleteDataDestinationService } from '../use-cases/delete-data-destination.service';
import { GetDataDestinationService } from '../use-cases/get-data-destination.service';
import { GetDataDestinationImpactService } from '../use-cases/get-data-destination-impact.service';
import { ListDataDestinationsService } from '../use-cases/list-data-destinations.service';
import { RotateSecretKeyService } from '../use-cases/rotate-secret-key.service';
import { UpdateDataDestinationService } from '../use-cases/update-data-destination.service';
import type { McpDataDestinationsFacade } from './mcp-data-destinations.facade';
import { toMcpDestinationType } from './mcp-destination-type';

@Injectable()
export class McpDataDestinationsFacadeImpl implements McpDataDestinationsFacade {
  constructor(
    private readonly list: ListDataDestinationsService,
    private readonly create: CreateDataDestinationService,
    private readonly get: GetDataDestinationService,
    private readonly update: UpdateDataDestinationService,
    private readonly impact: GetDataDestinationImpactService,
    private readonly remove: DeleteDataDestinationService,
    private readonly rotate: RotateSecretKeyService,
    private readonly mapper: McpDestinationMapper
  ) {}

  async listDestinations(
    request: McpListDestinationsRequest
  ): Promise<McpListDestinationsResponse> {
    const items = await this.list.run(
      new ListDataDestinationsCommand(
        request.projectId,
        request.userId,
        request.roles ?? [],
        request.ownerFilter
      )
    );
    return {
      destinations: items
        .filter(item => !request.type || toMcpDestinationType(item.type) === request.type)
        .map(item => this.mapper.toDto(item))
        .filter(
          item => !request.ownerId || item.owners.some(owner => owner.userId === request.ownerId)
        ),
    };
  }

  async createDestination(
    request: McpCreateDestinationRequest
  ): Promise<McpCreateDestinationResponse> {
    const result = await this.create.run(this.mapper.toCreateCommand(request));
    return { id: result.id, name: result.title };
  }

  async getDestination(actor: AuthorizationContext, id: string): Promise<McpDestinationDto> {
    const item = await this.get.run(
      new GetDataDestinationCommand(id, actor.projectId, actor.userId, actor.roles)
    );
    return this.mapper.toDto(item);
  }

  async updateDestination(
    actor: AuthorizationContext,
    request: McpUpdateDestinationRequest
  ): Promise<McpDestinationDto> {
    const destination = await this.update.run(this.mapper.toUpdateCommand(actor, request));
    return this.mapper.toDto(destination);
  }

  async setDestinationAccess(
    actor: AuthorizationContext,
    request: McpSetDestinationAccessRequest
  ): Promise<McpDestinationMutationResponse> {
    await this.update.run(this.mapper.toAccessCommand(actor, request));
    // The caller can lose access after a successful update.
    return { id: request.destinationId, status: 'updated' };
  }

  getDestinationImpact(actor: AuthorizationContext, id: string): Promise<DataDestinationImpact> {
    return this.impact.run(
      new GetDataDestinationImpactCommand(id, actor.projectId, actor.userId, actor.roles ?? [])
    );
  }

  async deleteDestination(
    actor: AuthorizationContext,
    id: string
  ): Promise<McpDestinationMutationResponse> {
    await this.remove.run(
      new DeleteDataDestinationCommand(id, actor.projectId, actor.userId, actor.roles)
    );
    return { id, status: 'deleted' };
  }

  async rotateDestinationSecretKey(
    actor: AuthorizationContext,
    id: string
  ): Promise<McpDestinationMutationResponse> {
    await this.rotate.run(
      new RotateSecretKeyCommand(id, actor.projectId, actor.userId, actor.roles)
    );
    return { id, status: 'rotated' };
  }
}
