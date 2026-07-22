import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { RunType } from '../../common/scheduler/shared/types';
import { DataDestinationConfig } from '../data-destination-types/data-destination-config.type';
import { isEmailConfig } from '../data-destination-types/data-destination-config.guards';
import { EmailConfigType } from '../data-destination-types/ee/email/schemas/email-config.schema';
import { ReportCondition } from '../data-destination-types/enums/report-condition.enum';
import {
  DataDestinationType,
  isEmailBasedDataDestinationType,
  isPullBasedDataDestinationType,
  toHumanReadable,
} from '../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsConfigType } from '../data-destination-types/google-sheets/schemas/google-sheets-config.schema';
import { LookerStudioConnectorConfigType } from '../data-destination-types/looker-studio-connector/schemas/looker-studio-connector-config.schema';
import { TemplateSourceTypeEnum } from '../enums/template-source-type.enum';
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
import { DataDestinationService } from '../services/data-destination.service';
import { DataMartRunService } from '../services/data-mart-run.service';
import { DataMartService } from '../services/data-mart.service';
import { OutputControlsValidatorService } from '../services/output-controls-validator.service';
import { QueryFailedError } from 'typeorm';
import { ReportAccessService } from '../services/report-access.service';
import { ReportService } from '../services/report.service';
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
  McpUpdateReportMessage,
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

/**
 * Cache lifetime for MCP-created Looker Studio reports, in seconds.
 * add_report accepts no Looker-specific input, so every report gets this
 * default. Keep in sync with the web form default in
 * apps/web/src/features/data-marts/reports/edit/components/LookerStudioReportEditForm
 * (the backend schema floor is 60, the web form minimum is 300).
 */
const LOOKER_STUDIO_DEFAULT_CACHE_LIFETIME_SECONDS = 300;

const LOOKER_STUDIO_DUPLICATE_REPORT_MESSAGE =
  'A Looker Studio report already exists for this data mart and destination — ' +
  'each pair has exactly one report. Use the existing report, or delete it first.';

const MCP_RUN_REPORT_DESTINATION_TYPES = [
  DataDestinationType.GOOGLE_SHEETS,
  DataDestinationType.EMAIL,
  DataDestinationType.SLACK,
  DataDestinationType.MS_TEAMS,
  DataDestinationType.GOOGLE_CHAT,
] as const;
// MCP run_report only supports destinations that can be actively pushed by this tool.
// This is a tool contract allowlist, not the global push/pull destination classifier.
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
  [DataMartRunStatus.CANCELLED]: 'cancelled',
  [DataMartRunStatus.INTERRUPTED]: 'interrupted',
  [DataMartRunStatus.RESTRICTED]: 'restricted',
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
    private readonly dataDestinationService: DataDestinationService,
    private readonly accessDecisionService: AccessDecisionService,
    private readonly reportAccessService: ReportAccessService,
    private readonly outputControlsValidator: OutputControlsValidatorService,
    private readonly reportService: ReportService
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
    if (
      request.fields === undefined &&
      request.filterConfig === undefined &&
      request.aggregationConfig === undefined &&
      request.dateTruncConfig === undefined &&
      request.sortConfig === undefined &&
      request.limitConfig === undefined &&
      request.name === undefined &&
      request.message === undefined
    ) {
      throw new BadRequestException(
        'Nothing to update: provide fields, filters, slices, aggregations, date_buckets, sort, limit, name, and/or message'
      );
    }

    // UpdateReportCommand carries the FULL report state and the service
    // overwrites every output control, so merge the partial MCP input into the
    // current report. Keeping the current destination id skips the destination
    // re-auth path, and leaving ownerIds undefined keeps owners untouched.
    const current = await this.getReportService.run(
      new GetReportCommand(request.reportId, request.projectId, request.userId, request.roles)
    );

    // Looker Studio reports carry no name: the entity clears the title on
    // insert, but nothing re-clears it on update, so a rename here would
    // persist a title the product guarantees is empty — and mislead the agent
    // into confirming a name the UI never shows. Mirrors the add-path guard.
    if (
      request.name !== undefined &&
      current.dataDestinationAccess.type === DataDestinationType.LOOKER_STUDIO
    ) {
      throw new BadRequestException(
        'The name parameter is not applicable to Looker Studio reports: they carry no name.'
      );
    }

    const destinationConfig =
      request.message !== undefined
        ? this.mergeMessageIntoConfig(
            current.dataDestinationAccess.type,
            current.destinationConfig,
            request.message
          )
        : current.destinationConfig;

    await this.updateReportService.run(
      new UpdateReportCommand(
        request.reportId,
        request.projectId,
        request.userId,
        request.roles,
        request.name ?? current.title,
        current.dataDestinationAccess.id,
        destinationConfig,
        undefined,
        request.fields !== undefined
          ? this.toColumnConfig(request.fields)
          : (current.columnConfig ?? null),
        request.filterConfig !== undefined ? request.filterConfig : (current.filterConfig ?? null),
        request.sortConfig !== undefined ? request.sortConfig : (current.sortConfig ?? null),
        request.limitConfig !== undefined ? request.limitConfig : (current.limitConfig ?? null),
        request.aggregationConfig !== undefined
          ? request.aggregationConfig
          : (current.aggregationConfig ?? null),
        request.dateTruncConfig !== undefined
          ? request.dateTruncConfig
          : (current.dateTruncConfig ?? null),
        current.uniqueCountConfig
      )
    );

    return { report_id: request.reportId, status: 'updated' };
  }

  /**
   * Merges a partial message change into the report's current destination
   * config. Only email-family reports carry a message; for anything else the
   * parameter is rejected with the report's real destination type named.
   */
  private mergeMessageIntoConfig(
    destinationType: DataDestinationType,
    current: DataDestinationConfig,
    message: McpUpdateReportMessage
  ): DataDestinationConfig {
    if (!isEmailBasedDataDestinationType(destinationType) || !isEmailConfig(current)) {
      throw new BadRequestException(
        'The message parameter applies only to email, slack, teams, and google_chat ' +
          `reports; this report's destination is ${toHumanReadable(destinationType)}`
      );
    }

    const subject = message.subject?.trim();
    const body = message.body?.trim();

    if (!body) {
      if (!subject) {
        throw new BadRequestException('Provide at least one of message.subject or message.body');
      }
      // Subject-only change: keep the rest of the stored config exactly as-is
      // (whatever template source — or legacy shape — it has).
      return { ...current, subject };
    }

    // A new body always means a CUSTOM_MESSAGE source (replacing an insight
    // template if one was set). Rebuild the config from scratch: stored
    // configs may still be in the legacy messageTemplate shape, and carrying
    // legacy remnants forward alongside templateSource would be invalid.
    return this.buildCustomMessageConfig(subject || current.subject, body, current.reportCondition);
  }

  /**
   * Single construction site for the CUSTOM_MESSAGE email config, shared by
   * the add and update paths so their shapes cannot drift apart.
   */
  private buildCustomMessageConfig(
    subject: string,
    body: string,
    reportCondition: ReportCondition
  ): DataDestinationConfig {
    return {
      type: EmailConfigType,
      subject,
      templateSource: {
        type: TemplateSourceTypeEnum.CUSTOM_MESSAGE,
        config: { messageTemplate: body },
      },
      reportCondition,
    };
  }

  async addReport(request: McpAddReportRequest): Promise<McpAddReportResult> {
    // Branch on the destination's actual type: only the Google Sheets path
    // has an external side effect, so only it needs pre-flight validation.
    //
    // Deliberate ordering: the cheap input-shape guards below (and the Looker
    // existence check) run before CreateReportService's USE checks. They can
    // reveal the destination's type and whether a report exists for a pair —
    // but only within the caller's own project, where the mcp:read surface
    // (list_destinations, get_data_mart_reports) exposes the same metadata.
    // Authorization comes first only where a side effect demands it (Google
    // Sheets pre-flight).
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      request.destinationId,
      request.projectId
    );

    // One up-front guard instead of per-branch calls: any current or future
    // non-email type rejects a supplied message rather than silently dropping it.
    if (!isEmailBasedDataDestinationType(destination.type)) {
      this.assertNoMessage(destination.type, request);
    }

    switch (destination.type) {
      case DataDestinationType.GOOGLE_SHEETS:
        return this.addGoogleSheetsReport(request);
      case DataDestinationType.LOOKER_STUDIO:
        return this.addLookerStudioReport(request);
      default:
        if (isEmailBasedDataDestinationType(destination.type)) {
          return this.addEmailFamilyReport(request, destination.type);
        }
        throw new BusinessViolationException(
          `add_report does not support ${toHumanReadable(destination.type)} destinations yet. ` +
            'Supported destination types: Google Sheets, Looker Studio, ' +
            'Email, Slack, Microsoft Teams, Google Chat.'
        );
    }
  }

  /**
   * `name` is meaningful only where a report has a user-visible title: the
   * Google Sheets and email-family paths require it. Looker Studio rejects it
   * instead (see addLookerStudioReport).
   */
  private requireName(destinationType: DataDestinationType, request: McpAddReportRequest): string {
    const name = request.name?.trim();
    if (!name) {
      throw new BadRequestException(
        `name is required for ${toHumanReadable(destinationType)} destinations`
      );
    }
    return name;
  }

  /**
   * The `message` group applies only to email-family destinations. Rejecting
   * it here (naming the destination's real type) beats letting the config
   * synthesis silently drop it.
   */
  private assertNoMessage(
    destinationType: DataDestinationType,
    request: McpAddReportRequest
  ): void {
    if (request.message !== undefined) {
      throw new BadRequestException(
        'The message parameter applies only to email, slack, teams, and google_chat ' +
          `destinations; the target destination is ${toHumanReadable(destinationType)}`
      );
    }
  }

  /**
   * Looker Studio reports carry no per-report settings in MCP — the config is
   * always the defaults. They also carry no name (the entity clears the title
   * on insert), and the domain allows exactly one report per data mart +
   * destination pair (the report id is deterministic), so a supplied name is
   * rejected and duplicates are caught here with a clean error instead of a
   * raw primary-key violation.
   */
  private async addLookerStudioReport(request: McpAddReportRequest): Promise<McpAddReportResult> {
    if (request.name !== undefined) {
      throw new BadRequestException(
        'The name parameter is not applicable to Looker Studio destinations: ' +
          'Looker Studio reports carry no name, and each data mart + destination ' +
          'pair has exactly one report.'
      );
    }

    if (await this.lookerStudioReportExists(request)) {
      throw new BusinessViolationException(LOOKER_STUDIO_DUPLICATE_REPORT_MESSAGE);
    }

    try {
      // The title is discarded by the domain for Looker Studio reports; pass
      // the empty string it would end up as anyway.
      return await this.createReportWithConfig(
        request,
        DataDestinationType.LOOKER_STUDIO,
        {
          type: LookerStudioConnectorConfigType,
          cacheLifetime: LOOKER_STUDIO_DEFAULT_CACHE_LIFETIME_SECONDS,
        },
        ''
      );
    } catch (error) {
      // Two concurrent add_report calls can both pass the existence check; the
      // deterministic report id then makes the losing INSERT fail. Re-check
      // before translating, so genuine DB failures keep their original error.
      if (error instanceof QueryFailedError && (await this.lookerStudioReportExists(request))) {
        throw new BusinessViolationException(LOOKER_STUDIO_DUPLICATE_REPORT_MESSAGE);
      }
      throw error;
    }
  }

  private lookerStudioReportExists(request: McpAddReportRequest): Promise<boolean> {
    return this.reportService.existsByDataMartIdAndDestinationIdAndProjectId(
      request.dataMartId,
      request.destinationId,
      request.projectId
    );
  }

  /**
   * Email-family reports (email, Slack, Microsoft Teams, Google Chat) carry
   * the message subject and body; recipients/channels live on the destination
   * itself. Only CUSTOM_MESSAGE bodies are supported over MCP (insight
   * templates would need insight MCP tools first), and the send condition is
   * not exposed — reports get the product default (send always), matching the
   * web create form.
   */
  private async addEmailFamilyReport(
    request: McpAddReportRequest,
    destinationType: DataDestinationType
  ): Promise<McpAddReportResult> {
    // The facade is a public interface, so the message invariant is enforced
    // here as well, not only by the tool-layer input schema.
    const name = this.requireName(destinationType, request);
    const body = request.message?.body?.trim();
    if (!body) {
      throw new BadRequestException(
        `message.body is required for ${toHumanReadable(destinationType)} destinations`
      );
    }

    return this.createReportWithConfig(
      request,
      destinationType,
      this.buildCustomMessageConfig(
        request.message?.subject?.trim() || name,
        body,
        ReportCondition.ALWAYS
      ),
      name
    );
  }

  /**
   * Shared tail of the side-effect-free add_report paths: CreateReportService
   * is transactional and performs every authorization and validation check
   * itself (including destination credentials), so unlike the Google Sheets
   * path no pre-flight is needed. Omitting ownerIds defaults ownership to the
   * requesting user.
   */
  private async createReportWithConfig(
    request: McpAddReportRequest,
    destinationType: DataDestinationType,
    destinationConfig: DataDestinationConfig,
    title: string
  ): Promise<McpAddReportResult> {
    const report = await this.createReportService.run(
      new CreateReportCommand(
        request.projectId,
        request.userId,
        title,
        request.dataMartId,
        request.destinationId,
        destinationConfig,
        undefined,
        request.roles,
        this.toColumnConfig(request.fields),
        request.filterConfig ?? null,
        request.sortConfig ?? null,
        request.limitConfig ?? null,
        request.aggregationConfig ?? null,
        request.dateTruncConfig ?? null
      )
    );

    return {
      report_id: report.id,
      destination_type: toMcpDestinationType(destinationType),
      owner: report.createdByUser?.email ?? null,
      status: 'created',
    };
  }

  private async addGoogleSheetsReport(request: McpAddReportRequest): Promise<McpAddReportResult> {
    const name = this.requireName(DataDestinationType.GOOGLE_SHEETS, request);
    const columnConfig = this.toColumnConfig(request.fields);

    // 1. Validate everything CreateReportService would reject BEFORE the
    //    external side effect: sheet creation is not transactional, so a
    //    failure after it would leave an orphaned document, and an
    //    unauthorized caller must not be able to trigger it at all.
    await this.assertCanCreateReport(request, columnConfig);

    // 2. Auto-create the Google Sheet.
    const sheet = await this.createGoogleSheetDocumentService.run(
      new CreateGoogleSheetDocumentCommand(
        request.destinationId,
        request.projectId,
        name,
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
        name,
        request.dataMartId,
        request.destinationId,
        {
          type: GoogleSheetsConfigType,
          spreadsheetId: sheet.spreadsheetId,
          sheetId: sheet.sheetId,
        },
        undefined,
        request.roles,
        columnConfig,
        request.filterConfig ?? null,
        request.sortConfig ?? null,
        request.limitConfig ?? null,
        request.aggregationConfig ?? null,
        request.dateTruncConfig ?? null
      )
    );

    return {
      report_id: report.id,
      destination_type: toMcpDestinationType(DataDestinationType.GOOGLE_SHEETS),
      owner: report.createdByUser?.email ?? null,
      status: 'created',
      sheet_url: buildGoogleSheetUrl(sheet.spreadsheetId, sheet.sheetId),
      placed_in_root: sheet.placedInRoot,
      shared_with_requester: sheet.sharedWithRequester,
    };
  }

  /**
   * Pre-flight for the Google Sheets addReport path, mirroring the checks
   * CreateReportService.run performs inside its transaction (kept deliberately
   * in sync): the service re-validates afterwards, but by then the sheet
   * already exists.
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
      filterConfig: request.filterConfig ?? null,
      sortConfig: request.sortConfig ?? null,
      limitConfig: request.limitConfig ?? null,
      aggregationConfig: request.aggregationConfig ?? null,
      dateTruncConfig: request.dateTruncConfig ?? null,
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
    // Must happen before loading the report/destination policy, so foreign-project ids
    // normalize to "Report not found" instead of leaking destination details.
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
      const destinationLabel = toHumanReadable(destinationType);
      const reason = isPullBasedDataDestinationType(destinationType)
        ? 'are pull-based and cannot be run through run_report'
        : 'are not supported by run_report';
      throw new BusinessViolationException(
        `Reports with a ${destinationLabel} destination ${reason}`
      );
    }

    // RunReportService intentionally keeps its own manual-run access check for
    // non-MCP callers; the facade pre-check above only protects MCP-specific
    // destination policy ordering from leaking cross-project report details.
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
    return messages.length
      ? messages.join('; ')
      : 'Report run failed; no detailed error was recorded';
  }
}
