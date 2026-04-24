import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class CreateDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: RelationshipMapper,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: CreateRelationshipCommand): Promise<RelationshipDto> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    this.relationshipService.validateNoSelfReference(
      command.sourceDataMartId,
      command.targetDataMartId
    );

    const [sourceDataMart, targetDataMart] = await Promise.all([
      this.dataMartService.getByIdAndProjectId(command.sourceDataMartId, command.projectId),
      this.dataMartService.getByIdAndProjectId(command.targetDataMartId, command.projectId),
    ]);

    const [canEditSource, canEditTarget] = await Promise.all([
      this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.sourceDataMartId,
        Action.EDIT,
        command.projectId
      ),
      this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.targetDataMartId,
        Action.EDIT,
        command.projectId
      ),
    ]);
    if (!canEditSource || !canEditTarget) {
      throw new ForbiddenException(
        'You do not have permission to create relationship between these DataMarts'
      );
    }

    this.relationshipService.validateSameStorage(
      sourceDataMart.storage.id,
      targetDataMart.storage.id
    );

    await this.relationshipService.validateUniqueAlias(
      command.sourceDataMartId,
      command.targetAlias
    );

    const hasCycle = await this.relationshipService.detectCycles(
      command.sourceDataMartId,
      command.targetDataMartId,
      sourceDataMart.storage.id,
      command.projectId
    );

    if (hasCycle) {
      throw new BusinessViolationException(
        'Adding this relationship would create a circular reference between data marts',
        {
          sourceDataMartId: command.sourceDataMartId,
          targetDataMartId: command.targetDataMartId,
        }
      );
    }

    this.relationshipService.validateJoinFieldTypes(
      sourceDataMart.schema,
      targetDataMart.schema,
      command.joinConditions
    );

    const relationship = await this.relationshipService.create(
      command,
      sourceDataMart,
      targetDataMart
    );
    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(relationship);
    return this.mapper.toDomainDto(relationship, createdByUser);
  }
}
