import {
  BadRequestException,
  ConflictException,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Transactional } from 'typeorm-transactional';
import { DataMartService } from '../services/data-mart.service';
import { CancelDataMartRunCommand } from '../dto/domain/cancel-data-mart-run.command';
import { AccessDecisionService, EntityType, Action } from '../services/access-decision';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartRunService } from '../services/data-mart-run.service';
import { ConnectorRunTriggerService } from '../services/connector/connector-run-trigger.service';
import { ReportRunTriggerService } from '../services/report-run-trigger.service';
import { ReportService } from '../services/report.service';

const STANDARD_REPORT_RUN_TYPES = new Set<DataMartRunType>([
  DataMartRunType.GOOGLE_SHEETS_EXPORT,
  DataMartRunType.EMAIL,
  DataMartRunType.SLACK,
  DataMartRunType.MS_TEAMS,
  DataMartRunType.GOOGLE_CHAT,
]);

const CANCELLABLE_RUN_STATUSES = new Set<DataMartRunStatus>([
  DataMartRunStatus.PENDING,
  DataMartRunStatus.RUNNING,
]);

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
      throw new ConflictException('Data mart run not found');
    }

    if (!this.isSupportedRunType(run.type)) {
      throw new BadRequestException('Only connector and standard report runs can be cancelled');
    }

    if (!CANCELLABLE_RUN_STATUSES.has(run.status)) {
      throw new ConflictException(`Cannot cancel data mart run in ${run.status} status`);
    }

    if (this.isStandardReportRun(run.type) && !run.reportId) {
      throw new ConflictException('Report run is missing report reference');
    }

    const wasCancelled = await this.dataMartRunService.markAsCancelled(run);
    if (!wasCancelled) {
      throw new ConflictException('Cannot cancel data mart run because it is no longer active');
    }

    if (run.type === DataMartRunType.CONNECTOR) {
      await this.connectorRunTriggerService.stopTriggersForRun(run.id);
      return;
    }

    await this.reportRunTriggerService.stopTriggersForRun(run.id);
    await this.reportService.markRunAsCancelled(run.reportId!);
  }

  private isSupportedRunType(type: DataMartRunType): boolean {
    return type === DataMartRunType.CONNECTOR || this.isStandardReportRun(type);
  }

  private isStandardReportRun(type: DataMartRunType): boolean {
    return STANDARD_REPORT_RUN_TYPES.has(type);
  }
}
