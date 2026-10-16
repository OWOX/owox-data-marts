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
import { BackfillChainMeta, readBackfillChainMeta } from '../utils/manual-backfill-range';

/**
 * How many times the cancel follows a backfill chain that advances underneath it. A finished
 * segment atomically queues the next run, so the row the user cancelled may be terminal by the
 * time the cancel lands; the fresh active run is then the one to stop. Segments run for
 * minutes, so one hand-over per attempt is already unlikely.
 */
const MAX_CHAIN_CANCEL_ATTEMPTS = 3;

const NO_LONGER_ACTIVE_MESSAGE = 'Cannot cancel data mart run because it is no longer active';

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

    // A backfill chain is resolved outside any transaction (see cancelChainRun); every other
    // run is cancelled in one.
    const chainMeta = await this.findChainMeta(command);
    if (chainMeta) {
      await this.cancelChainRun(command, chainMeta);
      return;
    }

    await this.cancelRunState(command);
  }

  /** The clicked run's chain metadata, or undefined when it is not a connector chain segment. */
  private async findChainMeta(
    command: CancelDataMartRunCommand
  ): Promise<BackfillChainMeta | undefined> {
    const run = await this.dataMartRunService.getByIdAndDataMartId(command.runId, command.id);
    if (run?.type !== DataMartRunType.CONNECTOR) return undefined;
    return readBackfillChainMeta(run.additionalParams);
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
      await this.markActiveRunAsCancelled(run);
      await this.connectorRunTriggerService.stopTriggersForRun(run.id);
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
      throw new ConflictException(NO_LONGER_ACTIVE_MESSAGE);
    }
  }

  /**
   * Cancels a segment of a backfill chain. Cancelling any segment stops the whole backfill: at
   * most one chain run is active at a time, and a cancelled segment never queues the next one —
   * so stopping the active run stops everything that remains. Completed segments keep their
   * data, history, and consumption.
   *
   * The clicked row can already be finished (a stale page), and the chain may advance while the
   * cancel is in flight, so the target is resolved again on every attempt. That resolution must
   * not share a transaction with the cancel: under MySQL's REPEATABLE READ a transaction's
   * first read fixes its snapshot, and a successor committed afterwards would stay invisible
   * to every retry. Each attempt therefore resolves with plain reads (current data) and cancels
   * in a transaction of its own. Locking reads are no option: SQLite, which self-hosted
   * deployments use, rejects them.
   */
  private async cancelChainRun(
    command: CancelDataMartRunCommand,
    chainMeta: BackfillChainMeta
  ): Promise<void> {
    for (let attempt = 0; attempt < MAX_CHAIN_CANCEL_ATTEMPTS; attempt++) {
      const target = await this.resolveChainTarget(command, chainMeta);
      if (!target) break;

      if (await this.cancelChainRunState(target)) return;
      // The target finished between resolving it and cancelling it: the chain advanced.
    }

    throw new ConflictException(NO_LONGER_ACTIVE_MESSAGE);
  }

  /**
   * The chain run to cancel: the clicked run while it is still active, otherwise the data
   * mart's active connector run when it belongs to the same chain. Null when the chain has
   * ended, or when the active run is an unrelated one that must be left alone.
   */
  private async resolveChainTarget(
    command: CancelDataMartRunCommand,
    chainMeta: BackfillChainMeta
  ): Promise<DataMartRun | null> {
    const clicked = await this.dataMartRunService.getByIdAndDataMartId(command.runId, command.id);
    if (clicked && isCancellableDataMartRunStatus(clicked.status)) return clicked;

    const active = await this.dataMartRunService.findActiveConnectorRun(command.id);
    const isSameChain =
      active && readBackfillChainMeta(active.additionalParams)?.id === chainMeta.id;
    return isSameChain ? active : null;
  }

  /** @returns false when the run reached a terminal status before the guarded update. */
  @Transactional()
  private async cancelChainRunState(run: DataMartRun): Promise<boolean> {
    if (!(await this.dataMartRunService.markAsCancelled(run))) return false;
    await this.connectorRunTriggerService.stopTriggersForRun(run.id);
    return true;
  }

  private getStandardReportRunReportId(run: { reportId?: string | null }): string {
    if (!run.reportId) {
      throw new ConflictException('Report run is missing report reference');
    }

    return run.reportId;
  }
}
