import { Injectable } from '@nestjs/common';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { toMcpDestinationType } from './mcp-destination-type';
import {
  McpGetDataMartReportsRequest,
  McpGetDataMartReportsResponse,
  McpReportScheduleItem,
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

    const triggersByReportId = await this.loadReportTriggers(request.dataMartId, request.projectId);

    return {
      reports: reports.map(report => ({
        report_id: report.id,
        name: report.title,
        destination_id: report.dataDestinationAccess.id,
        destination_type: toMcpDestinationType(report.dataDestinationAccess.type),
        // Report the creator as the owner (consistent with list_destinations):
        // the owners relation has no stable ordering.
        owner: report.createdByUser?.email ?? null,
        schedules: (triggersByReportId.get(report.id) ?? []).map(trigger =>
          this.toScheduleItem(trigger)
        ),
        last_run_at: report.lastRunAt?.toISOString() ?? null,
        last_run_status: report.lastRunStatus ?? null,
      })),
    };
  }

  /**
   * Loads the data mart's schedule triggers once and groups the REPORT_RUN ones
   * by their target report. A report can have any number of schedules; they are
   * all returned, ordered by creation time so the output is deterministic
   * rather than dependent on DB row order.
   */
  private async loadReportTriggers(
    dataMartId: string,
    projectId: string
  ): Promise<Map<string, DataMartScheduledTrigger[]>> {
    const triggers = await this.scheduledTriggerService.getAllByDataMartIdAndProjectId(
      dataMartId,
      projectId
    );

    const byReportId = new Map<string, DataMartScheduledTrigger[]>();
    for (const trigger of triggers) {
      if (trigger.type !== ScheduledTriggerType.REPORT_RUN) {
        continue;
      }
      const reportId = trigger.triggerConfig?.reportId;
      if (!reportId) {
        continue;
      }
      const reportTriggers = byReportId.get(reportId);
      if (reportTriggers) {
        reportTriggers.push(trigger);
      } else {
        byReportId.set(reportId, [trigger]);
      }
    }
    for (const reportTriggers of byReportId.values()) {
      // The id tie-break keeps the order stable when several triggers share a
      // creation timestamp (e.g. batch-created) — DB row order is not reliable.
      reportTriggers.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
      );
    }
    return byReportId;
  }

  private toScheduleItem(trigger: DataMartScheduledTrigger): McpReportScheduleItem {
    return {
      trigger_id: trigger.id,
      cron_expression: trigger.cronExpression,
      time_zone: trigger.timeZone,
      is_active: trigger.isActive,
      next_run_at: trigger.nextRunTimestamp?.toISOString() ?? null,
      last_run_at: trigger.lastRunTimestamp?.toISOString() ?? null,
    };
  }
}
