import { Injectable } from '@nestjs/common';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { ReportDto } from '../dto/domain/report.dto';
import { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { toMcpDestinationType } from './mcp-destination-type';
import {
  McpGetDataMartReportsRequest,
  McpGetDataMartReportsResponse,
  McpReportStatus,
  McpReportsFacade,
} from './mcp-reports.facade';

@Injectable()
export class McpReportsFacadeImpl implements McpReportsFacade {
  constructor(
    private readonly listReportsByDataMartService: ListReportsByDataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService
  ) {}

  async getDataMartReports(
    request: McpGetDataMartReportsRequest
  ): Promise<McpGetDataMartReportsResponse> {
    const reports = await this.listReportsByDataMartService.run(
      new ListReportsByDataMartCommand(
        request.dataMartId,
        request.projectId,
        request.userId,
        request.roles
      )
    );

    // No reports (or the data mart is not visible → empty list): skip the trigger query.
    if (reports.length === 0) {
      return { reports: [] };
    }

    const triggerByReportId = await this.loadReportTriggers(request.dataMartId, request.projectId);

    return {
      reports: reports.map(report => {
        const trigger = triggerByReportId.get(report.id);
        return {
          report_id: report.id,
          name: report.title,
          destination_id: report.dataDestinationAccess.id,
          destination_type: toMcpDestinationType(report.dataDestinationAccess.type),
          // Report the creator as the owner (consistent with list_destinations):
          // the owners relation has no stable ordering.
          owner: report.createdByUser?.email ?? null,
          schedule: trigger?.cronExpression ?? null,
          last_run_at: report.lastRunAt?.toISOString() ?? null,
          status: this.deriveStatus(report, trigger),
        };
      }),
    };
  }

  /**
   * Loads the data mart's schedule triggers once and indexes the REPORT_RUN ones
   * by their target report. When a report has more than one trigger, an active
   * trigger wins and ties break on the earliest creation, so the resulting
   * schedule and status are deterministic rather than dependent on row order.
   */
  private async loadReportTriggers(
    dataMartId: string,
    projectId: string
  ): Promise<Map<string, DataMartScheduledTrigger>> {
    const triggers = await this.scheduledTriggerService.getAllByDataMartIdAndProjectId(
      dataMartId,
      projectId
    );

    const byReportId = new Map<string, DataMartScheduledTrigger>();
    for (const trigger of triggers) {
      if (trigger.type !== ScheduledTriggerType.REPORT_RUN) {
        continue;
      }
      const reportId = trigger.triggerConfig?.reportId;
      if (!reportId) {
        continue;
      }
      const existing = byReportId.get(reportId);
      if (!existing || this.preferredTrigger(trigger, existing) === trigger) {
        byReportId.set(reportId, trigger);
      }
    }
    return byReportId;
  }

  private preferredTrigger(
    a: DataMartScheduledTrigger,
    b: DataMartScheduledTrigger
  ): DataMartScheduledTrigger {
    if (a.isActive !== b.isActive) {
      return a.isActive ? a : b;
    }
    return a.createdAt <= b.createdAt ? a : b;
  }

  private deriveStatus(
    report: ReportDto,
    trigger: DataMartScheduledTrigger | undefined
  ): McpReportStatus {
    if (report.lastRunStatus === ReportRunStatus.ERROR) {
      return 'error';
    }
    if (trigger?.isActive) {
      return 'active';
    }
    // No schedule, or the schedule is turned off.
    return 'paused';
  }
}
