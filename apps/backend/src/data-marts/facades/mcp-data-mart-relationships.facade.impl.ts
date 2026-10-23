import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Role } from '@owox/idp-protocol';
import { satisfiesRole } from '../../idp/utils/role-hierarchy';
import { McpDataMartRelationshipsMapper } from '../mappers/mcp-data-mart-relationships.mapper';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { CreateDataMartRelationshipService } from '../use-cases/create-data-mart-relationship.service';
import { DeleteDataMartRelationshipService } from '../use-cases/delete-data-mart-relationship.service';
import { GetDataMartRelationshipGraphService } from '../use-cases/get-data-mart-relationship-graph.service';
import { UpdateDataMartRelationshipService } from '../use-cases/update-data-mart-relationship.service';
import {
  McpCreateDataMartRelationshipRequest,
  McpDataMartRelationshipDto,
  McpDataMartRelationshipActor,
  McpDataMartRelationshipGraphDto,
  McpDataMartRelationshipsFacade,
  McpDeleteDataMartRelationshipRequest,
  McpGetDataMartRelationshipGraphRequest,
  McpUpdateDataMartRelationshipRequest,
} from './mcp-data-mart-relationships.facade';

@Injectable()
export class McpDataMartRelationshipsFacadeImpl implements McpDataMartRelationshipsFacade {
  constructor(
    private readonly createService: CreateDataMartRelationshipService,
    private readonly updateService: UpdateDataMartRelationshipService,
    private readonly deleteService: DeleteDataMartRelationshipService,
    private readonly graphService: GetDataMartRelationshipGraphService,
    private readonly mapper: RelationshipMapper,
    private readonly outputMapper: McpDataMartRelationshipsMapper
  ) {}

  async createRelationship(
    request: McpCreateDataMartRelationshipRequest
  ): Promise<McpDataMartRelationshipDto> {
    this.requireRole(request, 'editor');
    const command = this.mapper.toCreateCommand(request.dataMartId, request, request);
    return this.outputMapper.toRelationship(await this.createService.run(command));
  }

  async updateRelationship(
    request: McpUpdateDataMartRelationshipRequest
  ): Promise<McpDataMartRelationshipDto> {
    this.requireRole(request, 'editor');
    const command = this.mapper.toUpdateCommand(
      request.relationshipId,
      request.dataMartId,
      request,
      request
    );
    return this.outputMapper.toRelationship(await this.updateService.run(command));
  }

  async deleteRelationship(request: McpDeleteDataMartRelationshipRequest): Promise<void> {
    this.requireRole(request, 'editor');
    const command = this.mapper.toDeleteCommand(
      request.relationshipId,
      request.dataMartId,
      request
    );
    await this.deleteService.run(command);
  }

  async getRelationshipGraph(
    request: McpGetDataMartRelationshipGraphRequest
  ): Promise<McpDataMartRelationshipGraphDto> {
    this.requireRole(request, 'viewer');
    const command = this.mapper.toGetRelationshipGraphCommand(request.dataMartId, request);
    return this.outputMapper.toGraph(await this.graphService.run(command));
  }

  private requireRole(actor: McpDataMartRelationshipActor, role: Role): void {
    if (!actor.userId?.trim()) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    if (!actor.projectId?.trim() || !satisfiesRole(actor.roles ?? [], role)) {
      throw new ForbiddenException(`An authenticated project ${role} is required`);
    }
  }
}
