import { ForbiddenException, Injectable } from '@nestjs/common';
import { ListRelationshipsCommand } from '../dto/domain/list-relationships.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';

@Injectable()
export class ListDataMartRelationshipsService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly mapper: RelationshipMapper,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: ListRelationshipsCommand): Promise<RelationshipDto[]> {
    const [, canSee] = await Promise.all([
      this.dataMartService.getByIdAndProjectId(command.dataMartId, command.projectId),
      this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.dataMartId,
        Action.SEE,
        command.projectId
      ),
    ]);
    if (!canSee) {
      throw new ForbiddenException('You do not have access to this DataMart');
    }

    const relationships = await this.relationshipService.findBySourceDataMartId(command.dataMartId);

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(relationships);

    return this.mapper.toDomainDtoList(relationships, userProjectionsList);
  }
}
