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

@Injectable()
export class DeleteDataMartRelationshipService {
  constructor(
    private readonly relationshipService: DataMartRelationshipService,
    private readonly dataMartService: DataMartService,
    private readonly reportDataCacheService: ReportDataCacheService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: DeleteRelationshipCommand): Promise<void> {
    if (!command.userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

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

    await this.relationshipService.delete(relationship);
    await this.reportDataCacheService.invalidateByDataMartId(command.sourceDataMartId);
  }
}
