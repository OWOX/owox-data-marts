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
  reportId: string;
  cron?: string;
  isActive?: boolean;
  type?: ScheduledTriggerType;
  createdAt?: Date;
}): DataMartScheduledTrigger {
  return {
    type: overrides.type ?? ScheduledTriggerType.REPORT_RUN,
    triggerConfig: { type: 'scheduled-report-run-config', reportId: overrides.reportId },
    isActive: overrides.isActive ?? true,
    cronExpression: overrides.cron ?? '0 9 * * 1',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
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
      [buildTrigger({ reportId: 'r1', cron: '0 9 * * 1', isActive: true })]
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
        schedule: '0 9 * * 1',
        last_run_at: '2026-06-10T10:00:00.000Z',
        status: 'active',
      },
    ]);
  });

  it('derives status and schedule across the trigger/last-run matrix', async () => {
    const { facade } = buildFacade(
      [
        buildReport({ id: 'no-trigger', lastRunStatus: ReportRunStatus.SUCCESS }),
        buildReport({ id: 'paused', lastRunStatus: ReportRunStatus.SUCCESS }),
        buildReport({ id: 'active', lastRunStatus: ReportRunStatus.SUCCESS }),
        buildReport({ id: 'errored', lastRunStatus: ReportRunStatus.ERROR }),
      ],
      [
        buildTrigger({ reportId: 'paused', cron: '0 8 * * *', isActive: false }),
        buildTrigger({ reportId: 'active', cron: '0 9 * * *', isActive: true }),
        buildTrigger({ reportId: 'errored', cron: '0 7 * * *', isActive: true }),
      ]
    );

    const result = await facade.getDataMartReports(request);
    const byId = Object.fromEntries(result.reports.map(r => [r.report_id, r]));

    expect(byId['no-trigger']).toMatchObject({ schedule: null, status: 'paused' });
    // A disabled schedule is still reported, but the status is paused.
    expect(byId['paused']).toMatchObject({ schedule: '0 8 * * *', status: 'paused' });
    expect(byId['active']).toMatchObject({ schedule: '0 9 * * *', status: 'active' });
    // A failed last run wins over an otherwise-active schedule.
    expect(byId['errored']).toMatchObject({ schedule: '0 7 * * *', status: 'error' });
  });

  it('ignores connector triggers and triggers targeting other reports', async () => {
    const { facade } = buildFacade(
      [buildReport({ id: 'r1', lastRunStatus: ReportRunStatus.SUCCESS })],
      [
        buildTrigger({ reportId: 'r1', type: ScheduledTriggerType.CONNECTOR_RUN, isActive: true }),
        buildTrigger({ reportId: 'other-report', cron: '0 1 * * *', isActive: true }),
      ]
    );

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0]).toMatchObject({ schedule: null, status: 'paused' });
  });

  it('prefers an active trigger deterministically when a report has several', async () => {
    const { facade } = buildFacade(
      [buildReport({ id: 'r1', lastRunStatus: ReportRunStatus.SUCCESS })],
      [
        buildTrigger({ reportId: 'r1', cron: 'inactive-cron', isActive: false }),
        buildTrigger({ reportId: 'r1', cron: 'active-cron', isActive: true }),
      ]
    );

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0]).toMatchObject({ schedule: 'active-cron', status: 'active' });
  });

  it('returns an empty list without querying triggers when there are no reports', async () => {
    const { facade, scheduledTriggerService } = buildFacade([], []);

    const result = await facade.getDataMartReports(request);

    expect(result).toEqual({ reports: [] });
    expect(scheduledTriggerService.getAllByDataMartIdAndProjectId).not.toHaveBeenCalled();
  });

  it('returns owner null when the report has no creator', async () => {
    const { facade } = buildFacade(
      [buildReport({ id: 'r1', createdByEmail: null, lastRunStatus: ReportRunStatus.SUCCESS })],
      []
    );

    const result = await facade.getDataMartReports(request);

    expect(result.reports[0].owner).toBeNull();
  });
});
