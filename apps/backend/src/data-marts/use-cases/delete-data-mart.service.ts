import { Injectable, ForbiddenException } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportService } from '../services/report.service';
import { DataMartService } from '../services/data-mart.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { ConnectorSourceCredentialsService } from '../services/connector/connector-source-credentials.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';

@Injectable()
export class DeleteDataMartService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly reportService: ReportService,
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly relationshipService: DataMartRelationshipService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  @Transactional()
  async run(command: DeleteDataMartCommand): Promise<void> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canDelete = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.DELETE,
        command.projectId
      );
      if (!canDelete) {
        throw new ForbiddenException('You do not have permission to delete this DataMart');
      }
    }

    if (
      !command.disableLegacySync &&
      dataMart.storage.type === DataStorageType.LEGACY_GOOGLE_BIGQUERY
    ) {
      await this.legacyDataMartsService.deleteDataMart(dataMart.id);
    }

    // Delete all reports related to this data mart
    await this.reportService.deleteAllByDataMartIdAndProjectId(command.id, command.projectId);

    // Delete all triggers related to this data mart
    await this.scheduledTriggerService.deleteAllByDataMartIdAndProjectId(
      command.id,
      command.projectId
    );

    await this.connectorSourceCredentialsService.deleteSecretsByDataMart(command.id);

    await this.relationshipService.deleteAllByDataMartId(command.id);

    await this.dataMartService.softDeleteByIdAndProjectId(command.id, command.projectId);
  }
}
