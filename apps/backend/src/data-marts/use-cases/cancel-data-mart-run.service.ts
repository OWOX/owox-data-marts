import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartService } from '../services/data-mart.service';
import { CancelDataMartRunCommand } from '../dto/domain/cancel-data-mart-run.command';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartRunService } from '../services/data-mart-run.service';
import { ConnectorRunTriggerService } from '../services/connector/connector-run-trigger.service';
import { ReportRunTriggerService } from '../services/report-run-trigger.service';
import { DataQualityRunService } from '../services/data-quality-run.service';
import { ReportService } from '../services/report.service';
import {
  isCancellableDataMartRunStatus,
  isStandardReportRunType,
} from '../utils/data-mart-run-cancellation';
import { readBackfillChainMeta } from '../utils/manual-backfill-range';

/**
 * How many times the cancel follows a backfill chain that advances underneath it. A finished
 * segment atomically queues the next run, so the row the user cancelled may be terminal by the
 * time the cancel lands; the fresh active run is then the one to stop. Segments run for
 * minutes, so one hand-over per attempt is already unlikely.
 */
const MAX_CHAIN_CANCEL_ATTEMPTS = 3;

@Injectable()
export class CancelDataMartRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly connectorRunTriggerService: ConnectorRunTriggerService,
    private readonly reportRunTriggerService: ReportRunTriggerService,
    private readonly dataQualityRunService: DataQualityRunService,
    private readonly reportService: ReportService,
    private readonly accessDecisionService: AccessDecisionService
  ) {}

  async run(command: CancelDataMartRunCommand): Promise<void> {
    await this.dataMartService.getByIdAndProjectId(command.id, command.projectId);

    if (command.userId) {
      const canEdit = await this.accessDecisionService.canAccess(
        command.userId,
        command.roles,
        EntityType.DATA_MART,
        command.id,
        Action.EDIT,
        command.projectId
      );
      if (!canEdit) {
        throw new ForbiddenException('You do not have permission to manage this DataMart');
      }
    }

    await this.cancelRunState(command);
  }

  @Transactional()
  private async cancelRunState(command: CancelDataMartRunCommand): Promise<void> {
    const run = await this.dataMartRunService.getByIdAndDataMartId(command.runId, command.id);

    if (!run) {
      throw new NotFoundException('Data mart run not found');
    }

    if (!this.isSupportedRunType(run.type)) {
      throw new BadRequestException(
        'Only connector, standard report, and Data Quality runs can be cancelled'
      );
    }

    if (!isCancellableDataMartRunStatus(run.status)) {
      throw new ConflictException(`Cannot cancel data mart run in ${run.status} status`);
    }

    if (run.type === DataMartRunType.DATA_QUALITY) {
      await this.dataQualityRunService.cancelActiveRun(run.id, command.id);
      return;
    }

    if (run.type === DataMartRunType.CONNECTOR) {
      await this.cancelConnectorRun(run);
      return;
    }

    const reportId = this.getStandardReportRunReportId(run);
    await this.markActiveRunAsCancelled(run);
    await this.reportRunTriggerService.stopTriggersForRun(run.id);
    await this.reportService.markRunAsCancelled(reportId);
  }

  private isSupportedRunType(type: DataMartRunType): boolean {
    return (
      type === DataMartRunType.CONNECTOR ||
      type === DataMartRunType.DATA_QUALITY ||
      this.isStandardReportRun(type)
    );
  }

  private isStandardReportRun(type: DataMartRunType): boolean {
    return isStandardReportRunType(type);
  }

  private async markActiveRunAsCancelled(run: DataMartRun): Promise<void> {
    const wasCancelled = await this.dataMartRunService.markAsCancelled(run);
    if (!wasCancelled) {
      throw new ConflictException('Cannot cancel data mart run because it is no longer active');
    }
  }

  /**
   * Cancels a connector run. For a segment of a backfill chain, cancelling any segment stops
   * the whole backfill: at most one chain run is active at a time, and a cancelled segment
   * never queues the next one — so stopping the active run stops everything that remains.
   * Completed segments keep their data, history, and consumption.
   */
  private async cancelConnectorRun(run: DataMartRun): Promise<void> {
    const chainMeta = readBackfillChainMeta(run.additionalParams);
    if (!chainMeta) {
      await this.markActiveRunAsCancelled(run);
      await this.connectorRunTriggerService.stopTriggersForRun(run.id);
      return;
    }

    let target = run;
    for (let attempt = 0; attempt < MAX_CHAIN_CANCEL_ATTEMPTS; attempt++) {
      if (await this.dataMartRunService.markAsCancelled(target)) {
        await this.connectorRunTriggerService.stopTriggersForRun(target.id);
        return;
      }

      // The targeted segment already reached a terminal status. If its chain queued another
      // segment, that run is the data mart's one active connector run — cancel it instead.
      const active = await this.dataMartRunService.findActiveConnectorRun(run.dataMartId);
      const activeMeta = active ? readBackfillChainMeta(active.additionalParams) : undefined;
      if (!active || activeMeta?.id !== chainMeta.id) {
        break;
      }
      target = active;
    }

    throw new ConflictException('Cannot cancel data mart run because it is no longer active');
  }

  private getStandardReportRunReportId(run: { reportId?: string | null }): string {
    if (!run.reportId) {
      throw new ConflictException('Report run is missing report reference');
    }

    return run.reportId;
  }
}
