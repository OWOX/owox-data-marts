import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { RunType } from '../../common/scheduler/shared/types';
import {
  DataDestinationType,
  toHumanReadable,
} from '../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsConfigType } from '../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { CreateReportCommand } from '../dto/domain/create-report.command';
import { DeleteReportCommand } from '../dto/domain/delete-report.command';
import { GetReportCommand } from '../dto/domain/get-report.command';
import { CreateGoogleSheetDocumentCommand } from '../dto/domain/google-sheets/create-google-sheet-document.command';
import { ListReportsByDataMartCommand } from '../dto/domain/list-reports-by-data-mart.command';
import { UpdateReportCommand } from '../dto/domain/update-report.command';
import { ReportColumnConfig } from '../dto/schemas/report-column-config.schema';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { OutputControlsValidatorService } from '../services/output-controls-validator.service';
import { ReportAccessService } from '../services/report-access.service';
import { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import { CreateReportService } from '../use-cases/create-report.service';
import { DeleteReportService } from '../use-cases/delete-report.service';
import { GetReportService } from '../use-cases/get-report.service';
import { CreateGoogleSheetDocumentService } from '../use-cases/google-sheets/create-google-sheet-document.service';
import { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import { RunReportService } from '../use-cases/run-report.service';
import { UpdateReportService } from '../use-cases/update-report.service';
import { toReportRunType } from '../utils/report-run-type';
import { extractRunErrorMessage } from '../utils/run-error-message';
import { toMcpDestinationType } from './mcp-destination-type';
import {
  McpAddReportRequest,
  McpAddReportResult,
  McpDeleteReportRequest,
  McpDeleteReportResult,
  McpGetDataMartReportsRequest,
  McpGetDataMartReportsResponse,
  McpGetReportRunStatusRequest,
  McpGetReportRunStatusResponse,
  McpReportRunStatus,
  McpReportScheduleItem,
  McpReportsFacade,
  McpRunReportRequest,
  McpRunReportResponse,
  McpUpdateReportRequest,
  McpUpdateReportResult,
} from './mcp-reports.facade';

/**
 * Builds the shareable Google Sheets URL for a spreadsheet tab.
 * Keep the format in sync with `getGoogleSheetTabUrl` in
 * apps/web/src/features/data-marts/reports/shared/utils/google-sheets-url.utils.ts.
 */
function buildGoogleSheetUrl(spreadsheetId: string, sheetId: number): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}

const MCP_RUN_REPORT_DESTINATION_TYPES = [
  DataDestinationType.GOOGLE_SHEETS,
  DataDestinationType.EMAIL,
  DataDestinationType.SLACK,
  DataDestinationType.MS_TEAMS,
  DataDestinationType.GOOGLE_CHAT,
] as const;
const MCP_RUN_REPORT_DESTINATION_TYPE_SET: ReadonlySet<DataDestinationType> = new Set(
  MCP_RUN_REPORT_DESTINATION_TYPES
);
const RUN_REPORT_RUN_TYPES: ReadonlySet<DataMartRunType> = new Set(
  MCP_RUN_REPORT_DESTINATION_TYPES.map(toReportRunType)
);

const MCP_STATUS_BY_RAW_STATUS: Record<DataMartRunStatus, McpReportRunStatus> = {
  [DataMartRunStatus.PENDING]: 'running',
  [DataMartRunStatus.RUNNING]: 'running',
  [DataMartRunStatus.SUCCESS]: 'success',
  [DataMartRunStatus.FAILED]: 'failed',
  [DataMartRunStatus.CANCELLED]: 'failed',
  [DataMartRunStatus.INTERRUPTED]: 'failed',
  [DataMartRunStatus.RESTRICTED]: 'failed',
};

@Injectable()
export class McpReportsFacadeImpl implements McpReportsFacade {
  constructor(
    private readonly listReportsByDataMartService: ListReportsByDataMartService,
    private readonly scheduledTriggerService: ScheduledTriggerService,
    private readonly createReportService: CreateReportService,
    private readonly createGoogleSheetDocumentService: CreateGoogleSheetDocumentService,
    private readonly getReportService: GetReportService,
    private readonly updateReportService: UpdateReportService,
    private readonly deleteReportService: DeleteReportService,
    private readonly runReportService: RunReportService,
    private readonly dataMartRunService: DataMartRunService,
    private readonly dataMartService: DataMartService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly reportAccessService: ReportAccessService,
    private readonly outputControlsValidator: OutputControlsValidatorService
  ) {}

  async deleteReport(request: McpDeleteReportRequest): Promise<McpDeleteReportResult> {
    // The service enforces not-found and mutate-access itself and returns
    // void, so the confirmation shape is synthesized here.
    await this.deleteReportService.run(
      new DeleteReportCommand(request.reportId, request.projectId, request.userId, request.roles)
    );

    return { report_id: request.reportId, status: 'deleted' };
  }

  async updateReport(request: McpUpdateReportRequest): Promise<McpUpdateReportResult> {
    // The facade is a public interface, so the "at least one change" invariant
    // is enforced here as well, not only by the tool-layer input schema.
    if (request.fields === undefined && request.name === undefined) {
      throw new BadRequestException('Nothing to update: provide fields and/or name');
    }

    // UpdateReportCommand carries the FULL report state and the service
    // overwrites every output control, so merge the partial MCP input into the
    // current report. Keeping the current destination id skips the destination
    // re-auth path, and leaving ownerIds undefined keeps owners untouched.
    const current = await this.getReportService.run(
      new GetReportCommand(request.reportId, request.projectId, request.userId, request.roles)
    );

    await this.updateReportService.run(
      new UpdateReportCommand(
        request.reportId,
        request.projectId,
        request.userId,
        request.roles,
        request.name ?? current.title,
        current.dataDestinationAccess.id,
        current.destinationConfig,
        undefined,
        request.fields !== undefined
          ? this.toColumnConfig(request.fields)
          : (current.columnConfig ?? null),
        current.filterConfig ?? null,
        current.sortConfig ?? null,
        current.limitConfig ?? null,
        current.aggregationConfig ?? null,
        current.dateTruncConfig ?? null,
        current.uniqueCountConfig
      )
    );

    return { report_id: request.reportId, status: 'updated' };
  }

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

  async runReport(request: McpRunReportRequest): Promise<McpRunReportResponse> {
    await this.reportAccessService.checkOperateAccess(
      request.userId,
      request.roles,
      request.reportId,
      request.projectId
    );

    const report = await this.getReportService.run(
      new GetReportCommand(request.reportId, request.projectId, request.userId, request.roles)
    );
    const destinationType = report.dataDestinationAccess.type;
    if (!MCP_RUN_REPORT_DESTINATION_TYPE_SET.has(destinationType)) {
      throw new BusinessViolationException(
        `Reports with a ${toHumanReadable(destinationType)} destination are pull-based and cannot be run through run_report`
      );
    }

    const enqueued = await this.runReportService.run({
      reportId: request.reportId,
      userId: request.userId,
      roles: request.roles,
      projectId: request.projectId,
      runType: RunType.manual,
    });

    if (!enqueued) {
      throw new BusinessViolationException('Report is already running or pending');
    }

    return { reportId: request.reportId, runId: enqueued.dataMartRunId };
  }

  async getReportRunStatus(
    request: McpGetReportRunStatusRequest
  ): Promise<McpGetReportRunStatusResponse> {
    await this.reportAccessService.checkOperateAccess(
      request.userId,
      request.roles,
      request.reportId,
      request.projectId
    );

    const run = await this.dataMartRunService.findById(request.runId);
    if (!run || run.reportId !== request.reportId || !RUN_REPORT_RUN_TYPES.has(run.type)) {
      throw new NotFoundException(
        `Report run ${request.runId} not found for report ${request.reportId}`
      );
    }

    return { reportId: request.reportId, runId: request.runId, ...this.toRunResponse(run) };
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

  private toRunResponse(
    run: DataMartRun
  ): Pick<
    McpGetReportRunStatusResponse,
    'status' | 'queuedAt' | 'startedAt' | 'rawStatus' | 'error'
  > {
    const queuedAt = run.createdAt?.toISOString() ?? null;
    const startedAt = run.startedAt?.toISOString() ?? null;
    const status = MCP_STATUS_BY_RAW_STATUS[run.status];
    const base = { queuedAt, startedAt, rawStatus: run.status };

    if (status === 'failed') {
      return { ...base, status: 'failed', error: this.toErrorMessage(run) };
    }

    return { ...base, status, error: null };
  }

  private toErrorMessage(run: DataMartRun): string {
    const messages = (run.errors ?? []).map(entry => extractRunErrorMessage(entry));
    return messages.length ? messages.join('; ') : `Report run ended with status ${run.status}`;
  }
}
