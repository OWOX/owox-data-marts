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
import { ReportService } from '../services/report.service';
import {
  isCancellableDataMartRunStatus,
  isStandardReportRunType,
} from '../utils/data-mart-run-cancellation';

@Injectable()
export class CancelDataMartRunService {
  constructor(
    private readonly dataMartService: DataMartService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly connectorRunTriggerService: ConnectorRunTriggerService,
    private readonly reportRunTriggerService: ReportRunTriggerService,
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
      throw new BadRequestException('Only connector and standard report runs can be cancelled');
    }

    if (!isCancellableDataMartRunStatus(run.status)) {
      throw new ConflictException(`Cannot cancel data mart run in ${run.status} status`);
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
    return type === DataMartRunType.CONNECTOR || this.isStandardReportRun(type);
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

  private getStandardReportRunReportId(run: { reportId?: string | null }): string {
    if (!run.reportId) {
      throw new ConflictException('Report run is missing report reference');
    }

    return run.reportId;
  }
}
