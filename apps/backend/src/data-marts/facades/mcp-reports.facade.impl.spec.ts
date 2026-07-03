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
jest.mock('../services/data-mart.service', () => ({ DataMartService: jest.fn() }));
jest.mock('../use-cases/get-report.service', () => ({ GetReportService: jest.fn() }));
jest.mock('../use-cases/update-report.service', () => ({ UpdateReportService: jest.fn() }));
jest.mock('../services/output-controls-validator.service', () => ({
  OutputControlsValidatorService: jest.fn(),
}));
jest.mock('../services/access-decision', () => ({
  AccessDecisionService: jest.fn(),
  EntityType: { DATA_MART: 'DATA_MART', DESTINATION: 'DESTINATION' },
  Action: { USE: 'USE' },
}));

import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ReportDto } from '../dto/domain/report.dto';
import type { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import type { ScheduledTriggerService } from '../services/scheduled-trigger.service';
import type { CreateReportService } from '../use-cases/create-report.service';
import type { CreateGoogleSheetDocumentService } from '../use-cases/google-sheets/create-google-sheet-document.service';
import type { AccessDecisionService } from '../services/access-decision';
import type { DataMartService } from '../services/data-mart.service';
import type { OutputControlsValidatorService } from '../services/output-controls-validator.service';
import type { GetReportService } from '../use-cases/get-report.service';
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

function buildFacade(reports: ReportDto[], triggers: DataMartScheduledTrigger[]) {
  const listReportsByDataMartService = {
    run: jest.fn().mockResolvedValue(reports),
  } as unknown as jest.Mocked<ListReportsByDataMartService>;
  const scheduledTriggerService = {
    getAllByDataMartIdAndProjectId: jest.fn().mockResolvedValue(triggers),
  } as unknown as jest.Mocked<ScheduledTriggerService>;
  const createReportService = {
    run: jest.fn(),
  } as unknown as jest.Mocked<CreateReportService>;
  const createGoogleSheetDocumentService = {
    run: jest.fn(),
  } as unknown as jest.Mocked<CreateGoogleSheetDocumentService>;
  const dataMartService = {
    getByIdAndProjectId: jest.fn().mockResolvedValue({
      id: 'dm-1',
      status: DataMartStatus.PUBLISHED,
      storage: { type: 'GOOGLE_BIGQUERY' },
    }),
  } as unknown as jest.Mocked<DataMartService>;
  const accessDecisionService = {
    canAccess: jest.fn().mockResolvedValue(true),
  } as unknown as jest.Mocked<AccessDecisionService>;
  const outputControlsValidator = {
    validateForReport: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OutputControlsValidatorService>;
  const getReportService = {
    run: jest.fn(),
  } as unknown as jest.Mocked<GetReportService>;
  const updateReportService = {
    run: jest.fn(),
  } as unknown as jest.Mocked<UpdateReportService>;
  const facade = new McpReportsFacadeImpl(
    listReportsByDataMartService,
    scheduledTriggerService,
    createReportService,
    createGoogleSheetDocumentService,
    dataMartService,
    accessDecisionService,
    outputControlsValidator,
    getReportService,
    updateReportService
  );
  return {
    facade,
    listReportsByDataMartService,
    scheduledTriggerService,
    createReportService,
    createGoogleSheetDocumentService,
    dataMartService,
    accessDecisionService,
    outputControlsValidator,
    getReportService,
    updateReportService,
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
    const { facade, listReportsByDataMartService } = buildFacade(
      [
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
      [
        buildTrigger({
          id: 'trigger-1',
          reportId: 'r1',
          cron: '0 9 * * 1',
          timeZone: 'Europe/Kyiv',
          isActive: true,
          nextRunTimestamp: new Date('2026-06-15T06:00:00.000Z'),
          lastRunTimestamp: new Date('2026-06-08T06:00:00.000Z'),
        }),
      ]
    );

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
    const { facade } = buildFacade(
      [buildReport({ id: 'r1' })],
      [
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
      ]
    );

    const result = await facade.getDataMartReports(request);

    // A disabled schedule is still reported (is_active: false), nothing is collapsed.
    expect(result.reports[0].schedules).toEqual([
      expect.objectContaining({ trigger_id: 'older-disabled', is_active: false }),
      expect.objectContaining({ trigger_id: 'newer', is_active: true }),
    ]);
  });

  it('orders schedules with equal creation time by id, independent of row order', async () => {
    const sharedCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const { facade } = buildFacade(
      [buildReport({ id: 'r1' })],
      [
        buildTrigger({ id: 'trigger-b', reportId: 'r1', createdAt: sharedCreatedAt }),
        buildTrigger({ id: 'trigger-a', reportId: 'r1', createdAt: sharedCreatedAt }),
      ]
    );

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0].schedules.map(s => s.trigger_id)).toEqual(['trigger-a', 'trigger-b']);
  });

  it('reports an unscheduled report with an empty schedules list', async () => {
    const { facade } = buildFacade([buildReport({ id: 'r1' })], []);

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0]).toMatchObject({
      schedules: [],
      last_run_at: null,
      last_run_status: null,
    });
  });

  it('ignores connector triggers and triggers targeting other reports', async () => {
    const { facade } = buildFacade(
      [buildReport({ id: 'r1' })],
      [
        buildTrigger({ reportId: 'r1', type: ScheduledTriggerType.CONNECTOR_RUN, isActive: true }),
        buildTrigger({ reportId: 'other-report', cron: '0 1 * * *', isActive: true }),
      ]
    );

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0].schedules).toEqual([]);
  });

  it('passes the last run status through unchanged', async () => {
    const { facade } = buildFacade(
      [
        buildReport({ id: 'ok', lastRunStatus: ReportRunStatus.SUCCESS }),
        buildReport({ id: 'failed', lastRunStatus: ReportRunStatus.ERROR }),
        buildReport({ id: 'never-ran' }),
      ],
      []
    );

    const result = await facade.getDataMartReports(request);
    const byId = Object.fromEntries(result.reports.map(r => [r.report_id, r]));

    expect(byId['ok'].last_run_status).toBe(ReportRunStatus.SUCCESS);
    expect(byId['failed'].last_run_status).toBe(ReportRunStatus.ERROR);
    expect(byId['never-ran'].last_run_status).toBeNull();
  });

  it('returns an empty list without querying triggers when there are no reports', async () => {
    const { facade, scheduledTriggerService } = buildFacade([], []);

    const result = await facade.getDataMartReports(request);

    expect(result).toEqual({ reports: [] });
    expect(scheduledTriggerService.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });

  it('returns owner null when the report has no creator', async () => {
    const { facade } = buildFacade([buildReport({ id: 'r1', createdByEmail: null })], []);

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
    } = buildFacade([], []);
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
    const { facade, createGoogleSheetDocumentService, createReportService } = buildFacade([], []);
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
    } = buildFacade([], []);
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
    const { facade, createGoogleSheetDocumentService, dataMartService } = buildFacade([], []);
    dataMartService.getByIdAndProjectId.mockResolvedValue({
      id: 'dm-1',
      status: 'DRAFT',
      storage: { type: 'GOOGLE_BIGQUERY' },
    } as never);

    await expect(facade.addReport(addRequest)).rejects.toThrow('PUBLISHED');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('rejects a caller without data mart access before creating the sheet', async () => {
    const { facade, createGoogleSheetDocumentService, accessDecisionService } = buildFacade([], []);
    accessDecisionService.canAccess.mockResolvedValueOnce(false);

    await expect(facade.addReport(addRequest)).rejects.toThrow('access to the DataMart');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('rejects a caller without destination access before creating the sheet', async () => {
    const { facade, createGoogleSheetDocumentService, accessDecisionService } = buildFacade([], []);
    accessDecisionService.canAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(facade.addReport(addRequest)).rejects.toThrow('access to the Destination');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('rejects invalid fields before creating the sheet', async () => {
    const { facade, createGoogleSheetDocumentService, outputControlsValidator } = buildFacade(
      [],
      []
    );
    outputControlsValidator.validateForReport.mockRejectedValue(new Error('Unknown column'));

    await expect(facade.addReport(addRequest)).rejects.toThrow('Unknown column');
    expect(createGoogleSheetDocumentService.run).not.toHaveBeenCalled();
  });

  it('does not create the report when sheet creation fails', async () => {
    const { facade, createGoogleSheetDocumentService, createReportService } = buildFacade([], []);
    createGoogleSheetDocumentService.run.mockRejectedValue(
      new Error('Destination is not a Google Sheets destination')
    );

    await expect(facade.addReport(addRequest)).rejects.toThrow(
      'Destination is not a Google Sheets destination'
    );
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
    const built = buildFacade([], []);
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
