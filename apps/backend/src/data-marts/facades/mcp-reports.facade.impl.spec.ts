jest.mock('../use-cases/list-reports-by-data-mart.service', () => ({
  ListReportsByDataMartService: jest.fn(),
}));
jest.mock('../services/scheduled-trigger.service', () => ({
  ScheduledTriggerService: jest.fn(),
}));
jest.mock('../use-cases/create-report.service', () => ({ CreateReportService: jest.fn() }));
jest.mock('../use-cases/google-sheets/create-google-sheet-document.service', () => ({
  CreateGoogleSheetDocumentService: jest.fn(),
}));
jest.mock('../use-cases/get-report.service', () => ({
  GetReportService: jest.fn(),
}));
jest.mock('../use-cases/update-report.service', () => ({
  UpdateReportService: jest.fn(),
}));
jest.mock('../use-cases/delete-report.service', () => ({
  DeleteReportService: jest.fn(),
}));
jest.mock('../use-cases/run-report.service', () => ({
  RunReportService: jest.fn(),
}));
jest.mock('../services/data-mart-run.service', () => ({
  DataMartRunService: jest.fn(),
}));
jest.mock('../services/data-mart.service', () => ({
  DataMartService: jest.fn(),
}));
jest.mock('../services/data-destination.service', () => ({
  DataDestinationService: jest.fn(),
}));
jest.mock('../services/report-access.service', () => ({
  ReportAccessService: jest.fn(),
}));
jest.mock('../services/output-controls-validator.service', () => ({
  OutputControlsValidatorService: jest.fn(),
}));
jest.mock('../services/access-decision', () => ({
  AccessDecisionService: jest.fn(),
  EntityType: { DATA_MART: 'DATA_MART', DESTINATION: 'DESTINATION' },
  Action: { SEE: 'SEE', USE: 'USE' },
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RunType } from '../../common/scheduler/shared/types';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { GetReportCommand } from '../dto/domain/get-report.command';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ReportDto } from '../dto/domain/report.dto';
import type { AccessDecisionService } from '../services/access-decision';
import type { DataDestinationService } from '../services/data-destination.service';
import type { DataMartRunService } from '../services/data-mart-run.service';
import type { DataMartService } from '../services/data-mart.service';
import type { OutputControlsValidatorService } from '../services/output-controls-validator.service';
import type { ReportAccessService } from '../services/report-access.service';
import type { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import type { CreateReportService } from '../use-cases/create-report.service';
import type { CreateGoogleSheetDocumentService } from '../use-cases/google-sheets/create-google-sheet-document.service';
import type { DeleteReportService } from '../use-cases/delete-report.service';
import type { GetReportService } from '../use-cases/get-report.service';
import type { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import type { RunReportService } from '../use-cases/run-report.service';
import type { UpdateReportService } from '../use-cases/update-report.service';
import { McpReportsFacadeImpl } from './mcp-reports.facade.impl';

function buildReport(overrides: {
  id: string;
  title?: string;
  destinationId?: string;
  destinationType?: DataDestinationType;
  createdByEmail?: string | null;
  lastRunAt?: Date;
  lastRunStatus?: ReportRunStatus;
}): ReportDto {
  return {
    id: overrides.id,
    title: overrides.title ?? `Report ${overrides.id}`,
    dataDestinationAccess: {
      id: overrides.destinationId ?? 'dest-1',
      type: overrides.destinationType ?? DataDestinationType.GOOGLE_SHEETS,
    },
    createdByUser:
      overrides.createdByEmail === null
        ? null
        : { email: overrides.createdByEmail ?? 'creator@owox.com' },
    lastRunAt: overrides.lastRunAt,
    lastRunStatus: overrides.lastRunStatus,
  } as unknown as ReportDto;
}

function buildTrigger(overrides: {
  id?: string;
  reportId: string;
  cron?: string;
  timeZone?: string;
  isActive?: boolean;
  type?: ScheduledTriggerType;
  createdAt?: Date;
  nextRunTimestamp?: Date | null;
  lastRunTimestamp?: Date | null;
}): DataMartScheduledTrigger {
  return {
    id: overrides.id ?? `trigger-${overrides.reportId}`,
    type: overrides.type ?? ScheduledTriggerType.REPORT_RUN,
    triggerConfig: { type: 'scheduled-report-run-config', reportId: overrides.reportId },
    isActive: overrides.isActive ?? true,
    cronExpression: overrides.cron ?? '0 9 * * 1',
    timeZone: overrides.timeZone ?? 'UTC',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    nextRunTimestamp: overrides.nextRunTimestamp ?? null,
    lastRunTimestamp: overrides.lastRunTimestamp ?? null,
  } as unknown as DataMartScheduledTrigger;
}

function buildRun(overrides: Partial<DataMartRun>): DataMartRun {
  return {
    id: 'run-1',
    reportId: 'report-1',
    dataMartId: 'dm-1',
    type: DataMartRunType.GOOGLE_SHEETS_EXPORT,
    status: DataMartRunStatus.SUCCESS,
    createdAt: new Date('2026-07-01T09:59:00.000Z'),
    startedAt: new Date('2026-07-01T10:00:00.000Z'),
    errors: null,
    ...overrides,
  } as DataMartRun;
}

function createMocks() {
  return {
    listReportsByDataMartService: {
      run: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ListReportsByDataMartService>,
    scheduledTriggerService: {
      getAllByDataMartIdAndProjectId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ScheduledTriggerService>,
    createReportService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<CreateReportService>,
    createGoogleSheetDocumentService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<CreateGoogleSheetDocumentService>,
    getReportService: {
      run: jest.fn().mockResolvedValue(buildReport({ id: 'report-1' })),
    } as unknown as jest.Mocked<GetReportService>,
    updateReportService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<UpdateReportService>,
    deleteReportService: {
      run: jest.fn(),
    } as unknown as jest.Mocked<DeleteReportService>,
    runReportService: {
      run: jest.fn().mockResolvedValue({ dataMartRunId: 'run-1' }),
    } as unknown as jest.Mocked<RunReportService>,
    dataMartRunService: {
      findById: jest.fn().mockResolvedValue(buildRun({})),
    } as unknown as jest.Mocked<DataMartRunService>,
    dataMartService: {
      getByIdAndProjectId: jest.fn().mockResolvedValue({
        id: 'dm-1',
        status: DataMartStatus.PUBLISHED,
        storage: { type: 'GOOGLE_BIGQUERY' },
      } as DataMart),
    } as unknown as jest.Mocked<DataMartService>,
    dataDestinationService: {
      getByIdAndProjectId: jest.fn().mockResolvedValue({
        id: 'dest-1',
        type: DataDestinationType.GOOGLE_SHEETS,
      }),
    } as unknown as jest.Mocked<DataDestinationService>,
    accessDecisionService: {
      canAccess: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<AccessDecisionService>,
    reportAccessService: {
      checkOperateAccess: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ReportAccessService>,
    outputControlsValidator: {
      validateForReport: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OutputControlsValidatorService>,
  };
}

function createFacade(overrides?: {
  reports?: ReportDto[];
  triggers?: DataMartScheduledTrigger[];
}) {
  const mocks = createMocks();
  if (overrides?.reports) {
    mocks.listReportsByDataMartService.run.mockResolvedValue(overrides.reports);
  }
  if (overrides?.triggers) {
    mocks.scheduledTriggerService.getAllByDataMartIdAndProjectId.mockResolvedValue(
      overrides.triggers
    );
  }

  return {
    facade: new McpReportsFacadeImpl(
      mocks.listReportsByDataMartService,
      mocks.scheduledTriggerService,
      mocks.createReportService,
      mocks.createGoogleSheetDocumentService,
      mocks.getReportService,
      mocks.updateReportService,
      mocks.deleteReportService,
      mocks.runReportService,
      mocks.dataMartRunService,
      mocks.dataMartService,
      mocks.dataDestinationService,
      mocks.accessDecisionService,
      mocks.reportAccessService,
      mocks.outputControlsValidator
    ),
    ...mocks,
  };
}

const request = {
  dataMartId: 'dm-1',
  projectId: 'project-1',
  userId: 'user-1',
  roles: ['viewer'],
};

describe('McpReportsFacadeImpl', () => {
  it('maps a scheduled report to the MCP shape', async () => {
    const { facade, listReportsByDataMartService } = createFacade({
      reports: [
        buildReport({
          id: 'r1',
          title: 'Weekly revenue',
          destinationId: 'dest-99',
          destinationType: DataDestinationType.MS_TEAMS,
          createdByEmail: 'ann@owox.com',
          lastRunAt: new Date('2026-06-10T10:00:00.000Z'),
          lastRunStatus: ReportRunStatus.SUCCESS,
        }),
      ],
      triggers: [
        buildTrigger({
          id: 'trigger-1',
          reportId: 'r1',
          cron: '0 9 * * 1',
          timeZone: 'Europe/Kyiv',
          isActive: true,
          nextRunTimestamp: new Date('2026-06-15T06:00:00.000Z'),
          lastRunTimestamp: new Date('2026-06-08T06:00:00.000Z'),
        }),
      ],
    });

    const result = await facade.getDataMartReports(request);

    expect(listReportsByDataMartService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        dataMartId: 'dm-1',
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['viewer'],
      })
    );
    expect(result.reports).toEqual([
      {
        report_id: 'r1',
        data_mart_id: 'dm-1',
        name: 'Weekly revenue',
        destination_id: 'dest-99',
        destination_type: 'teams',
        owner: 'ann@owox.com',
        schedules: [
          {
            trigger_id: 'trigger-1',
            cron_expression: '0 9 * * 1',
            time_zone: 'Europe/Kyiv',
            is_active: true,
            next_run_at: '2026-06-15T06:00:00.000Z',
            last_run_at: '2026-06-08T06:00:00.000Z',
          },
        ],
        last_run_at: '2026-06-10T10:00:00.000Z',
        last_run_status: ReportRunStatus.SUCCESS,
      },
    ]);
  });

  it('returns every schedule of a report, ordered by creation time', async () => {
    const { facade } = createFacade({
      reports: [buildReport({ id: 'r1' })],
      triggers: [
        buildTrigger({
          id: 'newer',
          reportId: 'r1',
          cron: '0 9 * * *',
          isActive: true,
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
        buildTrigger({
          id: 'older-disabled',
          reportId: 'r1',
          cron: '0 8 * * *',
          isActive: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      ],
    });

    const result = await facade.getDataMartReports(request);

    // A disabled schedule is still reported (is_active: false), nothing is collapsed.
    expect(result.reports[0].schedules).toEqual([
      expect.objectContaining({ trigger_id: 'older-disabled', is_active: false }),
      expect.objectContaining({ trigger_id: 'newer', is_active: true }),
    ]);
  });

  it('orders schedules with equal creation time by id, independent of row order', async () => {
    const sharedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const { facade } = createFacade({
      reports: [buildReport({ id: 'r1' })],
      triggers: [
        buildTrigger({ id: 'trigger-b', reportId: 'r1', createdAt: sharedCreatedAt }),
        buildTrigger({ id: 'trigger-a', reportId: 'r1', createdAt: sharedCreatedAt }),
      ],
    });

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0].schedules.map(s => s.trigger_id)).toEqual(['trigger-a', 'trigger-b']);
  });

  it('reports an unscheduled report with an empty schedules list', async () => {
    const { facade } = createFacade({ reports: [buildReport({ id: 'r1' })], triggers: [] });

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0]).toMatchObject({
      schedules: [],
      last_run_at: null,
      last_run_status: null,
    });
  });

  it('ignores connector triggers and triggers targeting other reports', async () => {
    const { facade } = createFacade({
      reports: [buildReport({ id: 'r1' })],
      triggers: [
        buildTrigger({ reportId: 'r1', type: ScheduledTriggerType.CONNECTOR_RUN, isActive: true }),
        buildTrigger({ reportId: 'other-report', cron: '0 1 * * *', isActive: true }),
      ],
    });

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0].schedules).toEqual([]);
  });

  it('passes the last run status through unchanged', async () => {
    const { facade } = createFacade({
      reports: [
        buildReport({ id: 'ok', lastRunStatus: ReportRunStatus.SUCCESS }),
        buildReport({ id: 'failed', lastRunStatus: ReportRunStatus.ERROR }),
        buildReport({ id: 'never-ran' }),
      ],
      triggers: [],
    });

    const result = await facade.getDataMartReports(request);
    const byId = Object.fromEntries(result.reports.map(r => [r.report_id, r]));

    expect(byId['ok'].last_run_status).toBe(ReportRunStatus.SUCCESS);
    expect(byId['failed'].last_run_status).toBe(ReportRunStatus.ERROR);
    expect(byId['never-ran'].last_run_status).toBeNull();
  });

  it('returns an empty list without querying triggers when there are no reports', async () => {
    const { facade, scheduledTriggerService } = createFacade({ reports: [], triggers: [] });

    const result = await facade.getDataMartReports(request);

    expect(result).toEqual({ reports: [] });
    expect(scheduledTriggerService.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });

  it('returns owner null when the report has no creator', async () => {
    const { facade } = createFacade({
      reports: [buildReport({ id: 'r1', createdByEmail: null })],
      triggers: [],
    });

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0].owner).toBeNull();
  });
});

describe('McpReportsFacadeImpl.addReport', () => {
  const addRequest = {
    dataMartId: 'dm-1',
    destinationId: 'dest-1',
    fields: ['channel', 'revenue'],
    name: 'Weekly revenue',
    projectId: 'project-1',
    userId: 'user-1',
    userEmail: 'ann@owox.com',
    roles: ['editor'],
  };

  it('pre-validates, auto-creates a sheet, then creates a report pointing at it', async () => {
    const {
      facade,
      createGoogleSheetDocumentService,
      createReportService,
      accessDecisionService,
      outputControlsValidator,
    } = createFacade({ reports: [], triggers: [] });
    createGoogleSheetDocumentService.run.mockResolvedValue({ spreadsheetId: 'ss-1', sheetId: 0 });
    createReportService.run.mockResolvedValue({
      id: 'report-1',
      createdByUser: { email: 'ann@owox.com' },
    } as unknown as ReportDto);

    const result = await facade.addReport(addRequest);

    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'DATA_MART',
      'dm-1',
      'USE',
      'project-1'
    );
    expect(accessDecisionService.canAccess).toHaveBeenCalledWith(
      'user-1',
      ['editor'],
      'DESTINATION',
      'dest-1',
      'USE',
      'project-1'
    );
    expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith(
      expect.objectContaining({
        storageType: 'GOOGLE_BIGQUERY',
        dataMartId: 'dm-1',
        projectId: 'project-1',
        columnConfig: ['channel', 'revenue'],
      })
    );
    expect(createGoogleSheetDocumentService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationId: 'dest-1',
        projectId: 'project-1',
        title: 'Weekly revenue',
        requestedByUserId: 'user-1',
        userEmail: 'ann@owox.com',
      })
    );
    expect(createReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        title: 'Weekly revenue',
        dataMartId: 'dm-1',
        dataDestinationId: 'dest-1',
        destinationConfig: {
          type: 'google-sheets-config',
          spreadsheetId: 'ss-1',
          sheetId: 0,
        },
        columnConfig: ['channel', 'revenue'],
      })
    );
    expect(result).toEqual({
      report_id: 'report-1',
      owner: 'ann@owox.com',
      status: 'created',
      sheet_url: 'https://docs.google.com/spreadsheets/d/ss-1/edit#gid=0',
    });
  });

  it('passes the placed-in-root and shared-with-requester flags through', async () => {
    const { facade, createGoogleSheetDocumentService, createReportService } = createFacade({
      reports: [],
      triggers: [],
    });
    createGoogleSheetDocumentService.run.mockResolvedValue({
      spreadsheetId: 'ss-1',
      sheetId: 0,
      placedInRoot: true,
      sharedWithRequester: false,
    });
    createReportService.run.mockResolvedValue({
      id: 'report-1',
      createdByUser: null,
    } as unknown as ReportDto);

    const result = await facade.addReport(addRequest);

    expect(result).toMatchObject({ placed_in_root: true, shared_with_requester: false });
  });

  it('maps fields ["*"] to no column projection (all fields)', async () => {
    const {
      facade,
      createGoogleSheetDocumentService,
      createReportService,
      outputControlsValidator,
    } = createFacade({ reports: [], triggers: [] });
    createGoogleSheetDocumentService.run.mockResolvedValue({ spreadsheetId: 'ss-2', sheetId: 3 });
    createReportService.run.mockResolvedValue({ id: 'report-2', createdByUser: null } as ReportDto);

    await facade.addReport({ ...addRequest, fields: ['*'] });

    expect(outputControlsValidator.validateForReport).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: null })
    );
    expect(createReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: null })
    );
  });

  it('rejects a non-published data mart before creating the sheet', async () => {
    const { facade, createGoogleSheetDocumentService, dataMartService } = createFacade({
      reports: [],
      triggers: [],
    });
    dataMartService.getByIdAndProjectId.mockResolvedValue({
      id: 'dm-1',
      status: 'DRAFT',
      storage: { type: 'GOOGLE_BIGQUERY' },
    } as never);

    await expect(facade.addReport(addRequest)).rejects.toThrow('PUBLISHED');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('rejects a caller without data mart access before creating the sheet', async () => {
    const { facade, createGoogleSheetDocumentService, accessDecisionService } = createFacade({
      reports: [],
      triggers: [],
    });
    accessDecisionService.canAccess.mockResolvedValueOnce(false);

    await expect(facade.addReport(addRequest)).rejects.toThrow('access to the DataMart');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('rejects a caller without destination access before creating the sheet', async () => {
    const { facade, createGoogleSheetDocumentService, accessDecisionService } = createFacade({
      reports: [],
      triggers: [],
    });
    accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(facade.addReport(addRequest)).rejects.toThrow('access to the Destination');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('rejects invalid fields before creating the sheet', async () => {
    const { facade, createGoogleSheetDocumentService, outputControlsValidator } = createFacade({
      reports: [],
      triggers: [],
    });
    outputControlsValidator.validateForReport.mockRejectedValue(new Error('Unknown column'));

    await expect(facade.addReport(addRequest)).rejects.toThrow('Unknown column');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('does not create the report when sheet creation fails', async () => {
    const { facade, createGoogleSheetDocumentService, createReportService } = createFacade({
      reports: [],
      triggers: [],
    });
    createGoogleSheetDocumentService.run.mockRejectedValue(
      new Error('Destination is not a Google Sheets destination')
    );

    await expect(facade.addReport(addRequest)).rejects.toThrow(
      'Destination is not a Google Sheets destination'
    );
    expect(createReportService.run).not.toHaveBeenCalled();
  });

  it('creates a Looker Studio report with the default config and no sheet fields', async () => {
    const {
      facade,
      dataDestinationService,
      createGoogleSheetDocumentService,
      createReportService,
      accessDecisionService,
      outputControlsValidator,
    } = createFacade({ reports: [], triggers: [] });
    dataDestinationService.getByIdAndProjectId.mockResolvedValue({
      id: 'dest-1',
      type: DataDestinationType.LOOKER_STUDIO,
    } as never);
    createReportService.run.mockResolvedValue({
      id: 'report-1',
      createdByUser: { email: 'ann@owox.com' },
    } as unknown as ReportDto);

    const result = await facade.addReport(addRequest);

    expect(createReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        title: 'Weekly revenue',
        dataMartId: 'dm-1',
        dataDestinationId: 'dest-1',
        destinationConfig: {
          type: 'looker-studio-config',
          cacheLifetime: 300,
        },
        columnConfig: ['channel', 'revenue'],
      })
    );
    // No external side effect → no sheet and no pre-flight; CreateReportService
    // performs every check itself, inside its transaction.
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
    expect(outputControlsValidator.validateForReport).not.toHaveBeenCalled();
    expect(result).toEqual({
      report_id: 'report-1',
      owner: 'ann@owox.com',
      status: 'created',
    });
    expect(result).not.toHaveProperty('sheet_url');
  });

  it('maps fields ["*"] to no column projection for Looker Studio reports', async () => {
    const { facade, dataDestinationService, createReportService } = createFacade({
      reports: [],
      triggers: [],
    });
    dataDestinationService.getByIdAndProjectId.mockResolvedValue({
      id: 'dest-1',
      type: DataDestinationType.LOOKER_STUDIO,
    } as never);
    createReportService.run.mockResolvedValue({ id: 'report-3', createdByUser: null } as ReportDto);

    await facade.addReport({ ...addRequest, fields: ['*'] });

    expect(createReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: null })
    );
  });

  it('rejects unsupported destination types by name without touching any service', async () => {
    const {
      facade,
      dataDestinationService,
      createGoogleSheetDocumentService,
      createReportService,
    } = createFacade({ reports: [], triggers: [] });
    dataDestinationService.getByIdAndProjectId.mockResolvedValue({
      id: 'dest-1',
      type: DataDestinationType.EMAIL,
    } as never);

    await expect(facade.addReport(addRequest)).rejects.toThrow(
      'add_report does not support Email destinations yet'
    );
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
    expect(createReportService.run).not.toHaveBeenCalled();
  });

  it('propagates a missing destination without creating anything', async () => {
    const {
      facade,
      dataDestinationService,
      createGoogleSheetDocumentService,
      createReportService,
    } = createFacade({ reports: [], triggers: [] });
    dataDestinationService.getByIdAndProjectId.mockRejectedValue(
      new NotFoundException('Data Destination with id dest-1 and projectId project-1 not found')
    );

    await expect(facade.addReport(addRequest)).rejects.toThrow(NotFoundException);
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
    expect(createReportService.run).not.toHaveBeenCalled();
  });
});

describe('McpReportsFacadeImpl.updateReport', () => {
  const updateRequest = {
    reportId: 'report-1',
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
  };

  const currentReport = {
    id: 'report-1',
    title: 'Old name',
    dataDestinationAccess: { id: 'dest-1' },
    destinationConfig: { type: 'google-sheets-config', spreadsheetId: 'ss-1', sheetId: 0 },
    columnConfig: ['channel', 'revenue'],
    filterConfig: [{ column: 'channel', operator: 'eq', value: 'ads' }],
    sortConfig: [{ column: 'revenue', direction: 'DESC' }],
    limitConfig: 100,
    aggregationConfig: { groupBy: ['channel'] },
    dateTruncConfig: { column: 'date', unit: 'month' },
    uniqueCountConfig: undefined,
  } as unknown as ReportDto;

  function buildUpdateFacade() {
    const built = createFacade({ reports: [], triggers: [] });
    built.getReportService.run.mockResolvedValue(currentReport);
    built.updateReportService.run.mockResolvedValue(currentReport);
    return built;
  }

  it('renames the report while preserving every other setting', async () => {
    const { facade, getReportService, updateReportService } = buildUpdateFacade();

    const result = await facade.updateReport({ ...updateRequest, name: 'New name' });

    expect(getReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'report-1',
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
      })
    );
    expect(updateReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'report-1',
        // Authorization inputs must be forwarded verbatim — UpdateReportService
        // derives mutate-access decisions from them.
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
        title: 'New name',
        dataDestinationId: 'dest-1',
        destinationConfig: currentReport.destinationConfig,
        ownerIds: undefined,
        columnConfig: ['channel', 'revenue'],
        filterConfig: currentReport.filterConfig,
        sortConfig: currentReport.sortConfig,
        limitConfig: 100,
        aggregationConfig: currentReport.aggregationConfig,
        dateTruncConfig: currentReport.dateTruncConfig,
      })
    );
    expect(result).toEqual({ report_id: 'report-1', status: 'updated' });
  });

  it('rejects a call with nothing to update before touching any service', async () => {
    const { facade, getReportService, updateReportService } = buildUpdateFacade();

    await expect(facade.updateReport(updateRequest)).rejects.toThrow(
      'Nothing to update: provide fields and/or name'
    );
    expect(getReportService.run).not.toHaveBeenCalled();
    expect(updateReportService.run).not.toHaveBeenCalled();
  });

  it('replaces the column selection while preserving the name and filters', async () => {
    const { facade, updateReportService } = buildUpdateFacade();

    await facade.updateReport({ ...updateRequest, fields: ['channel'] });

    expect(updateReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Old name',
        columnConfig: ['channel'],
        filterConfig: currentReport.filterConfig,
      })
    );
  });

  it('maps fields ["*"] to no column projection', async () => {
    const { facade, updateReportService } = buildUpdateFacade();

    await facade.updateReport({ ...updateRequest, fields: ['*'] });

    expect(updateReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({ columnConfig: null })
    );
  });

  it('applies name and fields together', async () => {
    const { facade, updateReportService } = buildUpdateFacade();

    await facade.updateReport({ ...updateRequest, name: 'New name', fields: ['channel'] });

    expect(updateReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New name', columnConfig: ['channel'] })
    );
  });

  it('does not update when loading the current report fails', async () => {
    const { facade, getReportService, updateReportService } = buildUpdateFacade();
    getReportService.run.mockRejectedValue(new Error('Report with ID report-1 not found'));

    await expect(facade.updateReport({ ...updateRequest, name: 'New name' })).rejects.toThrow(
      'not found'
    );
    expect(updateReportService.run).not.toHaveBeenCalled();
  });
});

describe('McpReportsFacadeImpl.deleteReport', () => {
  const deleteRequest = {
    reportId: 'report-1',
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['editor'],
  };

  it('deletes the report and synthesizes the confirmation shape', async () => {
    const { facade, deleteReportService } = createFacade();
    deleteReportService.run.mockResolvedValue(undefined);

    const result = await facade.deleteReport(deleteRequest);

    expect(deleteReportService.run).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'report-1',
        projectId: 'project-1',
        userId: 'user-1',
        roles: ['editor'],
      })
    );
    expect(result).toEqual({ report_id: 'report-1', status: 'deleted' });
  });

  it('propagates a not-found error instead of reporting success', async () => {
    const { facade, deleteReportService } = createFacade();
    deleteReportService.run.mockRejectedValue(new Error('Report with ID report-1 not found'));

    await expect(facade.deleteReport(deleteRequest)).rejects.toThrow('not found');
  });
});

describe('McpReportsFacadeImpl.runReport', () => {
  const runRequest = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
    reportId: 'report-1',
  };

  it('enqueues a manual run and returns only the report and run ids', async () => {
    const { facade, getReportService, runReportService, dataMartRunService, reportAccessService } =
      createFacade();

    await expect(facade.runReport(runRequest)).resolves.toEqual({
      reportId: 'report-1',
      runId: 'run-1',
    });

    expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      'report-1',
      'project-1'
    );
    expect(getReportService.run).toHaveBeenCalledWith(
      new GetReportCommand('report-1', 'project-1', 'user-1', ['viewer'])
    );
    expect(runReportService.run).toHaveBeenCalledWith({
      reportId: 'report-1',
      userId: 'user-1',
      roles: ['viewer'],
      projectId: 'project-1',
      runType: RunType.manual,
    });
    expect(dataMartRunService.findById).not.toHaveBeenCalled();
  });

  it('rejects pull-based reports in the MCP facade before enqueuing a run', async () => {
    const { facade, getReportService, runReportService } = createFacade();
    getReportService.run.mockResolvedValue(
      buildReport({
        id: 'report-1',
        destinationType: DataDestinationType.LOOKER_STUDIO,
      })
    );

    await expect(facade.runReport(runRequest)).rejects.toThrow(
      'Reports with a Data Studio destination are pull-based and cannot be run through run_report'
    );
    expect(runReportService.run).not.toHaveBeenCalled();
  });

  it('rejects unsupported destination types without calling them pull-based', async () => {
    const { facade, getReportService, runReportService } = createFacade();
    getReportService.run.mockResolvedValue(
      buildReport({
        id: 'report-1',
        destinationType: 'FUTURE_PUSH_DESTINATION' as DataDestinationType,
      })
    );

    await expect(facade.runReport(runRequest)).rejects.toThrow(
      'Reports with a FUTURE_PUSH_DESTINATION destination are not supported by run_report'
    );
    await expect(facade.runReport(runRequest)).rejects.not.toThrow('pull-based');
    expect(runReportService.run).not.toHaveBeenCalled();
  });

  it('rejects when the report is already running or pending', async () => {
    const { facade, runReportService } = createFacade();
    runReportService.run.mockResolvedValue(null);

    await expect(facade.runReport(runRequest)).rejects.toThrow(
      'Report is already running or pending'
    );
  });
});

describe('McpReportsFacadeImpl.getReportRunStatus', () => {
  const statusRequest = {
    projectId: 'project-1',
    userId: 'user-1',
    roles: ['viewer'],
    reportId: 'report-1',
    runId: 'run-1',
  };

  it('checks operate access before returning status', async () => {
    const { facade, reportAccessService, dataMartService, accessDecisionService } = createFacade();

    await expect(facade.getReportRunStatus(statusRequest)).resolves.toMatchObject({
      reportId: 'report-1',
      runId: 'run-1',
      status: 'success',
    });

    expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      'report-1',
      'project-1'
    );
    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
    expect(accessDecisionService.canAccess).not.toHaveBeenCalled();
  });

  it('rejects when the caller cannot operate the report, without looking up the run', async () => {
    const { facade, reportAccessService, dataMartRunService } = createFacade();
    reportAccessService.checkOperateAccess.mockRejectedValue(
      new ForbiddenException(
        'You do not have access to the destination configured for this report.'
      )
    );

    await expect(facade.getReportRunStatus(statusRequest)).rejects.toThrow(ForbiddenException);
    expect(dataMartRunService.findById).not.toHaveBeenCalled();

    expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      'report-1',
      'project-1'
    );
  });

  it('normalizes foreign-project report access through ReportAccessService', async () => {
    const { facade, reportAccessService, dataMartService } = createFacade();
    reportAccessService.checkOperateAccess.mockRejectedValue(
      new ForbiddenException('Report not found.')
    );

    await expect(facade.getReportRunStatus(statusRequest)).rejects.toThrow('Report not found');

    expect(dataMartService.getByIdAndProjectId).not.toHaveBeenCalled();
  });

  it('reports success with the actual start time', async () => {
    const { facade } = createFacade();

    await expect(facade.getReportRunStatus(statusRequest)).resolves.toEqual({
      reportId: 'report-1',
      runId: 'run-1',
      status: 'success',
      queuedAt: '2026-07-01T09:59:00.000Z',
      startedAt: '2026-07-01T10:00:00.000Z',
      rawStatus: DataMartRunStatus.SUCCESS,
      error: null,
    });
  });

  it('reports a not-yet-started or in-progress run as running with null started_at', async () => {
    const { facade, dataMartRunService } = createFacade();
    dataMartRunService.findById.mockResolvedValue(
      buildRun({ status: DataMartRunStatus.PENDING, startedAt: null })
    );

    await expect(facade.getReportRunStatus(statusRequest)).resolves.toEqual({
      reportId: 'report-1',
      runId: 'run-1',
      status: 'running',
      queuedAt: '2026-07-01T09:59:00.000Z',
      startedAt: null,
      rawStatus: DataMartRunStatus.PENDING,
      error: null,
    });
  });

  it.each<[DataMartRunStatus, string[] | null, string, string | null]>([
    [
      DataMartRunStatus.FAILED,
      [
        JSON.stringify({
          type: 'error',
          at: '2026-07-02T10:00:01.000Z',
          error: 'storage read failed',
        }),
      ],
      'failed',
      'storage read failed',
    ],
    [
      DataMartRunStatus.FAILED,
      [JSON.stringify({ message: 'worker failed' })],
      'failed',
      'worker failed',
    ],
    [
      DataMartRunStatus.FAILED,
      [JSON.stringify({ msg: 'delivery failed' })],
      'failed',
      'delivery failed',
    ],
    [DataMartRunStatus.FAILED, ['Trigger handling failed'], 'failed', 'Trigger handling failed'],
    [DataMartRunStatus.FAILED, null, 'failed', 'Report run failed; no detailed error was recorded'],
    [DataMartRunStatus.CANCELLED, null, 'cancelled', null],
    [DataMartRunStatus.INTERRUPTED, null, 'interrupted', null],
    [DataMartRunStatus.RESTRICTED, null, 'restricted', null],
  ])(
    'reports %s runs with the matching MCP terminal status',
    async (status, errors, expectedStatus, expectedError) => {
      const { facade, dataMartRunService } = createFacade();
      dataMartRunService.findById.mockResolvedValue(buildRun({ status, errors }));

      await expect(facade.getReportRunStatus(statusRequest)).resolves.toMatchObject({
        status: expectedStatus,
        rawStatus: status,
        error: expectedError,
      });
    }
  );

  it('keeps backend error details for failed runs only', async () => {
    const { facade, dataMartRunService } = createFacade();
    dataMartRunService.findById.mockResolvedValue(
      buildRun({ status: DataMartRunStatus.FAILED, errors: ['Trigger handling failed'] })
    );

    await expect(facade.getReportRunStatus(statusRequest)).resolves.toMatchObject({
      status: 'failed',
      rawStatus: DataMartRunStatus.FAILED,
      error: 'Trigger handling failed',
    });
  });

  it('rejects when the run does not exist', async () => {
    const { facade, dataMartRunService } = createFacade();
    dataMartRunService.findById.mockResolvedValue(null);

    await expect(facade.getReportRunStatus(statusRequest)).rejects.toThrow(NotFoundException);
  });

  it('rejects when the run belongs to a different report, without leaking its status', async () => {
    const { facade, dataMartRunService, reportAccessService } = createFacade();
    dataMartRunService.findById.mockResolvedValue(
      buildRun({ reportId: 'someone-elses-report', status: DataMartRunStatus.SUCCESS })
    );

    await expect(facade.getReportRunStatus(statusRequest)).rejects.toThrow(NotFoundException);
    expect(dataMartRunService.findById).toHaveBeenCalledWith('run-1');
    expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      'report-1',
      'project-1'
    );
  });

  it('rejects a non-report run (e.g. connector run) whose reportId is null', async () => {
    const { facade, dataMartRunService } = createFacade();
    dataMartRunService.findById.mockResolvedValue(
      buildRun({ reportId: null, status: DataMartRunStatus.SUCCESS })
    );

    await expect(facade.getReportRunStatus(statusRequest)).rejects.toThrow(NotFoundException);
  });

  it('rejects report runs that could not have been returned by run_report', async () => {
    const { facade, dataMartRunService, reportAccessService } = createFacade();
    dataMartRunService.findById.mockResolvedValue(
      buildRun({ type: DataMartRunType.LOOKER_STUDIO, status: DataMartRunStatus.SUCCESS })
    );

    await expect(facade.getReportRunStatus(statusRequest)).rejects.toThrow(NotFoundException);
    expect(reportAccessService.checkOperateAccess).toHaveBeenCalledWith(
      'user-1',
      ['viewer'],
      'report-1',
      'project-1'
    );
  });
});
