import { Injectable, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { CreateRelationshipCommand } from '../dto/domain/create-relationship.command';
import { RelationshipDto } from '../dto/domain/relationship.dto';
import { RelationshipMapper } from '../mappers/relationship.mapper';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { UserProjectionsFetcherService } from '../services/user-projections-fetcher.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

@Injectable()
export class CreateDataMartRelationshipService {
  private readonly logger = new Logger(CreateDataMartRelationshipService.name);

  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly userProjectionsFetcherService: UserProjectionsFetcherService,
    private readonly mapper: RelationshipMapper,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
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

    // A join field absent from the schema is only a WARNING — the schema may simply be stale, so
    // refusing the save would block legitimate edits. It must not vanish, though: it is the one
    // early signal that the relationship will fail at the warehouse.
    const { warnings } = this.relationshipService.validateJoinFieldTypes(
      sourceDataMart.schema,
      targetDataMart.schema,
      command.joinConditions
    );
    if (warnings.length > 0) {
      this.logger.warn(
        `Relationship on Data Mart ${command.sourceDataMartId} saved with unverifiable join ` +
          `field(s): ${warnings.join('; ')}`
      );
    }

    const relationship = await this.relationshipService.create(
      command,
      sourceDataMart,
      targetDataMart
    );
    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_MART,
      command.sourceDataMartId,
      command.projectId
    );

    const createdByUser = await this.userProjectionsFetcherService.fetchCreatedByUser(relationship);
    const accessByDataMartId = new Map<string, boolean>([
      [command.sourceDataMartId, true],
      [command.targetDataMartId, true],
    ]);
    return this.mapper.toDomainDto(relationship, createdByUser, accessByDataMartId);
  }
}
