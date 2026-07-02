jest.mock('../use-cases/list-reports-by-data-mart.service', () => ({
  ListReportsByDataMartService: jest.fn(),
}));
jest.mock('../services/scheduled-trigger.service', () => ({
  ScheduledTriggerService: jest.fn(),
}));

import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataMartScheduledTrigger } from '../entities/data-mart-scheduled-trigger.entity';
import { ReportRunStatus } from '../enums/report-run-status.enum';
import { ScheduledTriggerType } from '../scheduled-trigger-types/enums/scheduled-trigger-type.enum';
import { ReportDto } from '../dto/domain/report.dto';
import type { ListReportsByDataMartService } from '../use-cases/list-reports-by-data-mart.service';
import type { ScheduledTriggerService } from '../services/scheduled-trigger.service';
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
  const facade = new McpReportsFacadeImpl(listReportsByDataMartService, scheduledTriggerService);
  return { facade, listReportsByDataMartService, scheduledTriggerService };
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
