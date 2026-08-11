import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DeleteDataMartCommand } from '../dto/domain/delete-data-mart.command';
import { LegacyDataMartsService } from '../services/legacy-data-marts/legacy-data-marts.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { ReportService } from '../services/report.service';
import { DataMartService } from '../services/data-mart.service';
import { DataMartRelationshipService } from '../services/data-mart-relationship.service';
import { ConnectorSourceCredentialsService } from '../services/connector/connector-source-credentials.service';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { DataMartSearchIndexInvalidationService } from '../services/data-mart-search-index-invalidation.service';

@Injectable()
export class DeleteDataMartService {
  private readonly logger = new Logger(DeleteDataMartService.name);

  constructor(
    private readonly dataMartService: DataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly reportService: ReportService,
    private readonly legacyDataMartsService: LegacyDataMartsService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly relationshipService: DataMartRelationshipService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly searchIndexInvalidation?: DataMartSearchIndexInvalidationService
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

    await this.handOverSecretsStillInUse(command.id, command.projectId);
    await this.connectorSourceCredentialsService.deleteSecretsByDataMart(command.id);

    const inboundSourceDataMartIds =
      (await this.searchIndexInvalidation?.findInboundSourceDataMartIds(
        command.id,
        command.projectId
      )) ?? [];

    await this.relationshipService.deleteAllByDataMartId(command.id);

    await this.dataMartService.softDeleteByIdAndProjectId(command.id, command.projectId);
    await this.searchIndexInvalidation?.scheduleDataMartDeleted(
      command.id,
      command.projectId,
      inboundSourceDataMartIds
    );
  }

  /**
   * A credentials record owned by the deleted DataMart may still be referenced
   * by another DataMart — the legacy state of the copied-config aliasing bug,
   * which ownership enforcement separates only when the referencing DataMart is
   * saved. Deleting such a record would wipe the credentials that DataMart runs
   * with, so ownership is handed over to the first live referencer instead; any
   * further referencers fork onto records of their own on their next save.
   * Records nobody else references are left for deleteSecretsByDataMart.
   */
  private async handOverSecretsStillInUse(dataMartId: string, projectId: string): Promise<void> {
    const ownRecords =
      await this.connectorSourceCredentialsService.getSecretsByDataMart(dataMartId);
    if (ownRecords.length === 0) {
      return;
    }

    const connectorDataMarts = await this.dataMartService.findByProjectIdAndDefinitionType(
      projectId,
      DataMartDefinitionType.CONNECTOR
    );

    const heirs = new Map<string, { dataMartId: string; configId: string | undefined }>();
    for (const candidate of connectorDataMarts) {
      if (candidate.id === dataMartId) {
        continue;
      }
      const definition = candidate.definition as
        | { connector?: { source?: { configuration?: unknown[] } } }
        | undefined;
      for (const item of definition?.connector?.source?.configuration ?? []) {
        const { _secrets_id: secretsId, _id: configId } = (item ?? {}) as Record<string, unknown>;
        if (typeof secretsId === 'string' && !heirs.has(secretsId)) {
          heirs.set(secretsId, {
            dataMartId: candidate.id,
            configId: typeof configId === 'string' ? configId : undefined,
          });
        }
      }
    }

    for (const record of ownRecords) {
      const heir = heirs.get(record.id);
      if (!heir) {
        continue;
      }
      this.logger.warn(
        `Credentials ${record.id} of deleted DataMart ${dataMartId} are still referenced by ` +
          `DataMart ${heir.dataMartId}. Transferring ownership instead of deleting.`
      );
      await this.connectorSourceCredentialsService.transferSecretsOwnership(
        record.id,
        heir.dataMartId,
        heir.configId
      );
    }
  }
}
