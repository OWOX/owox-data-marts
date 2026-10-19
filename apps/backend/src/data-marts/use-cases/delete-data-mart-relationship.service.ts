import { DataSource } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DeleteRelationshipCommand } from '../dto/domain/delete-relationship.command';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { DataMartService } from '../services/data-mart.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { AdvancedSearchIndexSyncService } from '../services/advanced-search-index-sync.service';
import { SearchableEntityType } from '../../common/search/search.facade';

@Injectable()
export class DeleteDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly dataSource: DataSource,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly advancedSearchIndexSync?: AdvancedSearchIndexSyncService
  ) {}

  @Transactional()
  async run(command: DeleteRelationshipCommand): Promise<void> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }
    await this.dataMartService.lockConfigurationReferences(command.projectId);

    await this.dataMartService.getByIdAndProjectId(command.sourceDataMartId, command.projectId);

    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    const canEdit = await this.accessDecisionService.canAccess(
      command.userId,
      command.roles,
      EntityType.DATA_MART,
      relationship.sourceDataMart.id,
      Action.EDIT,
      command.projectId
    );
    if (!canEdit) {
      throw new ForbiddenException(
        'You do not have permission to manage relationships of this DataMart'
      );
    }

    const target = await this.dataMartService.getByIdAndProjectId(
      relationship.targetDataMart.id,
      command.projectId
    );
    if (
      !(await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        target.id,
        Action.EDIT,
        command.projectId
      ))
    )
      throw new ForbiddenException(
        'You do not have permission to manage the target Data Mart relationship'
      );
    this.relationshipService.validateSameStorage(
      relationship.sourceDataMart.storage.id,
      target.storage.id
    );

    await this.dataMartService.advanceConfigurationRevision(
      this.dataSource.manager,
      command.sourceDataMartId,
      command.projectId,
      command.expectedRevision
    );

    await this.relationshipService.delete(relationship);
    await this.reportDataCacheService.invalidateByDataMartId(command.sourceDataMartId);

    await this.advancedSearchIndexSync?.scheduleReindex(
      SearchableEntityType.DATA_MART,
      command.sourceDataMartId,
      command.projectId
    );
  }
}
