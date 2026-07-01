import { ForbiddenException, Injectable } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { GoogleSheetsConfigType } from '../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { CreateGoogleSheetDocumentCommand } from '../dto/domain/google-sheets/create-google-sheet-document.command';
import { ReportColumnConfig } from '../dto/schemas/report-column-config.schema';
import { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import { CreateReportService } from '../use-cases/create-report.service';
import { CreateGoogleSheetDocumentService } from '../use-cases/google-sheets/create-google-sheet-document.service';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartService } from '../services/data-mart.service';
import { OutputControlsValidatorService } from '../services/output-controls-validator.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { toMcpDestinationType } from './mcp-destination-type';
import {
  McpAddReportRequest,
  McpAddReportResult,
  McpGetDataMartReportsRequest,
  McpGetDataMartReportsResponse,
  McpReportScheduleItem,
  McpReportsFacade,
} from './mcp-reports.facade';

/**
 * Builds the shareable Google Sheets URL for a spreadsheet tab.
 * Keep the format in sync with `getGoogleSheetTabUrl` in
 * apps/web/src/features/data-marts/reports/shared/utils/google-sheets-url.utils.ts.
 */
function buildGoogleSheetUrl(spreadsheetId: string, sheetId: number): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}

@Injectable()
export class McpReportsFacadeImpl implements McpReportsFacade {
  constructor(
    private readonly listReportsByDataMartService: ListReportsByDataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly createReportService: CreateReportService,
    private readonly createGoogleSheetDocumentService: CreateGoogleSheetDocumentService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly outputControlsValidator: OutputControlsValidatorService
  ) {}

  async addReport(request: McpAddReportRequest): Promise<McpAddReportResult> {
    const columnConfig = this.toColumnConfig(request.fields);

    // 1. Validate everything CreateReportService would reject BEFORE the
    //    external side effect: sheet creation is not transactional, so a
    //    failure after it would leave an orphaned document, and an
    //    unauthorized caller must not be able to trigger it at all.
    await this.assertCanCreateReport(request, columnConfig);

    // 2. Auto-create the Google Sheet. This also validates that the destination
    //    is a Google Sheets destination (it throws otherwise), so it doubles as
    //    the guard against unsupported destination types.
    const sheet = await this.createGoogleSheetDocumentService.run(
      new CreateGoogleSheetDocumentCommand(
        request.destinationId,
        request.projectId,
        request.name,
        request.userId,
        request.userEmail
      )
    );

    // 3. Create the report pointing at the freshly-created sheet. Omitting
    //    ownerIds makes the service default ownership to the requesting user.
    const report = await this.createReportService.run(
      new CreateReportCommand(
        request.projectId,
        request.userId,
        request.name,
        request.dataMartId,
        request.destinationId,
        {
          type: GoogleSheetsConfigType,
          spreadsheetId: sheet.spreadsheetId,
          sheetId: sheet.sheetId,
        },
        undefined,
        request.roles,
        columnConfig
      )
    );

    return {
      report_id: report.id,
      owner: report.createdByUser?.email ?? null,
      status: 'created',
      sheet_url: buildGoogleSheetUrl(sheet.spreadsheetId, sheet.sheetId),
      placed_in_root: sheet.placedInRoot,
      shared_with_requester: sheet.sharedWithRequester,
    };
  }

  /**
   * Pre-flight for addReport, mirroring the checks CreateReportService.run
   * performs inside its transaction (kept deliberately in sync): the service
   * re-validates afterwards, but by then the sheet already exists.
   */
  private async assertCanCreateReport(
    request: McpAddReportRequest,
    columnConfig: ReportColumnConfig
  ): Promise<void> {
    const dataMart = await this.dataMartService.getByIdAndProjectId(
      request.dataMartId,
      request.projectId
    );
    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new BusinessViolationException(
        `Cannot create report for data mart with status ${dataMart.status}. Data mart must be in PUBLISHED status.`
      );
    }

    const canUseDataMart = await this.accessDecisionService.canAccess(
      request.userId,
      request.roles,
      EntityType.DATA_MART,
      request.dataMartId,
      Action.USE,
      request.projectId
    );
    if (!canUseDataMart) {
      throw new ForbiddenException('You do not have access to the DataMart for this report');
    }

    const canUseDestination = await this.accessDecisionService.canAccess(
      request.userId,
      request.roles,
      EntityType.DESTINATION,
      request.destinationId,
      Action.USE,
      request.projectId
    );
    if (!canUseDestination) {
      throw new ForbiddenException('You do not have access to the Destination for this report');
    }

    await this.outputControlsValidator.validateForReport({
      storageType: dataMart.storage.type,
      dataMartId: dataMart.id,
      projectId: request.projectId,
      columnConfig,
      filterConfig: null,
      sortConfig: null,
      limitConfig: null,
      aggregationConfig: null,
      dateTruncConfig: null,
      uniqueCountConfig: null,
      accessor: { userId: request.userId, roles: request.roles },
    });
  }

  /** `['*']` (or any list containing `'*'`) means "all fields" → no column projection. */
  private toColumnConfig(fields: string[]): ReportColumnConfig {
    return fields.includes('*') ? null : fields;
  }

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
        data_mart_id: request.dataMartId,
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
      // Oldest-first is purely a stable chronological presentation — the order
      // carries no precedence semantics (schedules are equal peers; a newer
      // trigger is an additional schedule, not an override of an older one).
      // `createdAt` is the trigger's creation time and never changes on update.
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
