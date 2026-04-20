import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { GetRelationshipCommand } from '../dto/domain/get-relationship.command';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { ReportDataCacheService } from '../services/report-data-cache.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class DeleteDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: GetRelationshipCommand): Promise<void> {
    const relationship = await this.relationshipService.findById(command.relationshipId);

    if (!relationship || relationship.sourceDataMart.id !== command.sourceDataMartId) {
      throw new NotFoundException(
        `Relationship with ID ${command.relationshipId} not found for data mart ${command.sourceDataMartId}`
      );
    }

    if (command.userId) {
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
    }

    await this.relationshipService.delete(relationship);
    await this.reportDataCacheService.invalidateByDataMartId(command.sourceDataMartId);
  }
}
