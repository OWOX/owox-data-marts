import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ListRelationshipsCommand } from '../dto/domain/list-relationships.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { buildDmAccessFlags } from '../utils/build-dm-access-flags';

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
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    await this.dataMartService.getByIdAndProjectId(command.dataMartId, command.projectId);

    const canSee = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      command.dataMartId,
      Action.SEE,
      command.projectId
    );
    if (!canSee) {
      throw new ForbiddenException('You do not have access to this DataMart');
    }

    const relationships = await this.relationshipService.findBySourceDataMartId(command.dataMartId);

    const userProjectionsList =
      await this.userProjectionsFetcherService.fetchRelevantUserProjections(relationships);

    const uniqueDmIds = new Set<string>();
    for (const rel of relationships) {
      uniqueDmIds.add(rel.sourceDataMart.id);
      uniqueDmIds.add(rel.targetDataMart.id);
    }

    const accessByDmId = await buildDmAccessFlags(
      uniqueDmIds,
      command.userId,
      command.roles,
      command.projectId,
      this.accessDecisionService
    );

    return this.mapper.toDomainDtoList(relationships, userProjectionsList, accessByDmId);
  }
}
