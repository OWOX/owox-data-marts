import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
import { RelationshipResponseApiDto } from '../dto/presentation/relationship-response-api.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class GetDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly mapper: RelationshipMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: GetRelationshipCommand): Promise<RelationshipResponseApiDto> {
    await this.dataMartService.getByIdAndProjectId(command.sourceDataMartId, command.projectId);

    const canSee = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      command.sourceDataMartId,
      Action.SEE,
      command.projectId
    );
    if (!canSee) {
      throw new ForbiddenException('You do not have access to this DataMart');
    }

    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(relationship);

    return this.mapper.toResponse(relationship, createdByUser);
  }
}
