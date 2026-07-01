import { In, Repository } from 'typeorm';
import { RunType } from '../../common/scheduler/shared/types';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { OwoxEventDispatcher } from '../../common/event-dispatcher/owox-event-dispatcher';
import { DataDestinationType } from '../data-destination-types/enums/data-destination-type.enum';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMart } from '../entities/data-mart.entity';
import { Report } from '../entities/report.entity';
import { DataDestination } from '../entities/data-destination.entity';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { RoleScope } from '../enums/role-scope.enum';
import { DataMartRunService, ReportRunContext } from './data-mart-run.service';

function fakeDataMart(overrides: Partial<DataMart> = {}): DataMart {
  return {
    id: 'dm-1',
    projectId: 'proj-1',
    definition: { kind: 'sql', sql: 'SELECT 1' },
    ...overrides,
  } as unknown as DataMart;
}

function fakeDataDestination(
  type: DataDestinationType = DataDestinationType.GOOGLE_SHEETS
): DataDestination {
  return {
    id: 'dest-1',
    title: 'My Sheets',
    type,
    isEmailBased: () => false,
  } as unknown as DataDestination;
}

function fakeReport(overrides: Partial<Report> = {}): Report {
  return {
    id: 'report-1',
    title: 'Quarterly Export',
    dataMart: fakeDataMart(),
    dataDestination: fakeDataDestination(),
    destinationConfig: { type: DataDestinationType.GOOGLE_SHEETS } as never,
    filterConfig: undefined,
    sortConfig: undefined,
    limitConfig: undefined,
    ...overrides,
  } as unknown as Report;
}

function createService() {
  const saved: DataMartRun[] = [];

  const dataMartRunRepository = {
    create: jest.fn((data: Partial<DataMartRun>) => ({ ...data }) as DataMartRun),
    save: jest.fn(async (run: DataMartRun) => {
      saved.push(run);
      return run;
    }),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<DataMartRun>>;

  const systemClock = {
    now: jest.fn(() => new Date('2026-05-29T00:00:00.000Z')),
  } as unknown as jest.Mocked<SystemTimeService>;

  const eventDispatcher = {
    publishLocalOnCommit: jest.fn(),
  } as unknown as jest.Mocked<OwoxEventDispatcher>;

  const service = new DataMartRunService(dataMartRunRepository, systemClock, eventDispatcher);

  return { service, dataMartRunRepository, systemClock, eventDispatcher, saved };
}

function createQueryBuilderMock() {
  const qb = {
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    select: jest.fn(),
    orderBy: jest.fn(),
    addOrderBy: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
    getRawMany: jest.fn(),
    getMany: jest.fn(),
  };

  for (const method of [
    'innerJoin',
    'where',
    'andWhere',
    'select',
    'orderBy',
    'addOrderBy',
    'limit',
    'offset',
  ] as const) {
    qb[method].mockReturnValue(qb);
  }

  return qb;
}

const context: ReportRunContext = { createdById: 'user-1', runType: RunType.manual };

describe('DataMartRunService', () => {
  describe('listVisibleByProject', () => {
    it('sorts only run IDs, loads full rows without ORDER BY, and restores page order', async () => {
      const { service, dataMartRunRepository } = createService();
      const firstRun = { id: 'run-1', dataMart: { id: 'dm-1', title: 'First' } } as DataMartRun;
      const secondRun = {
        id: 'run-2',
        dataMart: { id: 'dm-2', title: 'Second' },
      } as DataMartRun;

      const pageQb = createQueryBuilderMock();
      pageQb.getRawMany.mockResolvedValue([{ id: 'run-2' }, { id: 'run-1' }]);
      const rowsQb = createQueryBuilderMock();
      rowsQb.getMany.mockResolvedValue([firstRun, secondRun]);
      (dataMartRunRepository.createQueryBuilder as jest.Mock)
        .mockReturnValueOnce(pageQb)
        .mockReturnValueOnce(rowsQb);

      const result = await service.listVisibleByProject({
        projectId: 'proj-1',
        userId: 'admin-1',
        roles: ['admin'],
        roleScope: RoleScope.ENTIRE_PROJECT,
        limit: 50,
        offset: 100,
      });

      expect(pageQb.select).toHaveBeenCalledWith('run.id', 'id');
      expect(pageQb.orderBy).toHaveBeenCalledWith('run.createdAt', 'DESC');
      expect(pageQb.addOrderBy).toHaveBeenCalledWith('run.id', 'DESC');
      expect(pageQb.limit).toHaveBeenCalledWith(50);
      expect(pageQb.offset).toHaveBeenCalledWith(100);
      expect(rowsQb.select).toHaveBeenCalledWith(['run', 'dataMart.id', 'dataMart.title']);
      expect(rowsQb.where).toHaveBeenCalledWith('run.id IN (:...runIds)', {
        runIds: ['run-2', 'run-1'],
      });
      expect(rowsQb.orderBy).not.toHaveBeenCalled();
      expect(result).toEqual([secondRun, firstRun]);
    });

    it('does not issue the full-row query for an empty page', async () => {
      const { service, dataMartRunRepository } = createService();
      const pageQb = createQueryBuilderMock();
      pageQb.getRawMany.mockResolvedValue([]);
      (dataMartRunRepository.createQueryBuilder as jest.Mock).mockReturnValueOnce(pageQb);

      await expect(
        service.listVisibleByProject({
          projectId: 'proj-1',
          userId: 'admin-1',
          roles: ['admin'],
          roleScope: RoleScope.ENTIRE_PROJECT,
        })
      ).resolves.toEqual([]);

      expect(dataMartRunRepository.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });

  describe('createAndMarkReportRunAsPending — reportDefinition outputConfig snapshot', () => {
    it('omits outputConfig from reportDefinition when the report has no filter/sort/limit', async () => {
      const { service, dataMartRunRepository } = createService();
      const report = fakeReport(); // filterConfig/sortConfig/limitConfig all undefined

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      expect(saved.reportDefinition).toBeDefined();
      expect((saved.reportDefinition as Record<string, unknown>)['outputConfig']).toBeUndefined();
    });

    it('snapshots filterConfig into reportDefinition.outputConfig when report has a filter', async () => {
      const { service, dataMartRunRepository } = createService();
      const filterConfig = [{ column: 'date', operator: 'gte', value: '2026-01-01' }];
      const report = fakeReport({ filterConfig } as Partial<Report>);

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (saved.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toBeDefined();
      expect(outputConfig['filterConfig']).toEqual(filterConfig);
      expect(outputConfig['sortConfig']).toBeUndefined();
      expect(outputConfig['limitConfig']).toBeUndefined();
    });

    it('snapshots sortConfig into reportDefinition.outputConfig when report has a sort', async () => {
      const { service, dataMartRunRepository } = createService();
      const sortConfig = [{ column: 'revenue', direction: 'desc' as const }];
      const report = fakeReport({ sortConfig } as Partial<Report>);

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (saved.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toBeDefined();
      expect(outputConfig['sortConfig']).toEqual(sortConfig);
    });

    it('snapshots limitConfig into reportDefinition.outputConfig when report has a limit', async () => {
      const { service, dataMartRunRepository } = createService();
      const report = fakeReport({ limitConfig: 100 } as Partial<Report>);

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (saved.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toBeDefined();
      expect(outputConfig['limitConfig']).toBe(100);
    });

    it('snapshots all three (filter + sort + limit) together into outputConfig', async () => {
      const { service, dataMartRunRepository } = createService();
      const filterConfig = [{ column: 'date', operator: 'eq', value: '2026-05-01' }];
      const sortConfig = [{ column: 'date', direction: 'asc' as const }];
      const report = fakeReport({ filterConfig, sortConfig, limitConfig: 50 } as Partial<Report>);

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (saved.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toEqual({ filterConfig, sortConfig, limitConfig: 50 });
    });

    // I1: aggregationConfig must be captured in the run-history snapshot
    it('snapshots aggregationConfig into reportDefinition.outputConfig when report has aggregations', async () => {
      const { service, dataMartRunRepository } = createService();
      const aggregationConfig = [{ column: 'revenue', function: 'SUM' as const }];
      const report = fakeReport({ aggregationConfig } as Partial<Report>);

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (saved.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toBeDefined();
      expect(outputConfig['aggregationConfig']).toEqual(aggregationConfig);
    });

    it('snapshots dateTruncConfig into reportDefinition.outputConfig when report has date-trunc rules', async () => {
      const { service, dataMartRunRepository } = createService();
      const dateTruncConfig = [{ column: 'date', unit: 'MONTH' as const }];
      const report = fakeReport({ dateTruncConfig } as Partial<Report>);

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (saved.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toBeDefined();
      expect(outputConfig['dateTruncConfig']).toEqual(dateTruncConfig);
    });

    it('snapshots all four (filter + sort + limit + aggregation) together into outputConfig', async () => {
      const { service, dataMartRunRepository } = createService();
      const filterConfig = [{ column: 'channel', operator: 'eq', value: 'organic' }];
      const sortConfig = [{ column: 'channel', direction: 'asc' as const }];
      const aggregationConfig = [{ column: 'revenue', function: 'SUM' as const }];
      const report = fakeReport({
        filterConfig,
        sortConfig,
        limitConfig: 100,
        aggregationConfig,
      } as Partial<Report>);

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (saved.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toEqual({
        filterConfig,
        sortConfig,
        limitConfig: 100,
        aggregationConfig,
      });
    });

    it('creates the run in PENDING status', async () => {
      const { service, dataMartRunRepository } = createService();
      const report = fakeReport();

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      expect(saved.status).toBe(DataMartRunStatus.PENDING);
    });

    it('maps GOOGLE_SHEETS destination to GOOGLE_SHEETS_EXPORT run type', async () => {
      const { service, dataMartRunRepository } = createService();
      const report = fakeReport({
        dataDestination: fakeDataDestination(DataDestinationType.GOOGLE_SHEETS),
      });

      await service.createAndMarkReportRunAsPending(report, context);

      const saved = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      expect(saved.type).toBe(DataMartRunType.GOOGLE_SHEETS_EXPORT);
    });
  });

  describe('createAndMarkReportRunAsStarted — outputConfig snapshot (same private path)', () => {
    it('also snapshots outputConfig when called via createAndMarkReportRunAsStarted', async () => {
      const { service, dataMartRunRepository } = createService();
      const filterConfig = [{ column: 'revenue', operator: 'gt', value: '0' }];
      const report = fakeReport({ filterConfig } as Partial<Report>);

      await service.createAndMarkReportRunAsStarted(report, context);

      // save is called once (markReportRunAsStarted calls save with RUNNING status)
      const runArg = (dataMartRunRepository.save as jest.Mock).mock.calls[0][0] as DataMartRun;
      const outputConfig = (runArg.reportDefinition as Record<string, unknown>)[
        'outputConfig'
      ] as Record<string, unknown>;
      expect(outputConfig).toBeDefined();
      expect(outputConfig['filterConfig']).toEqual(filterConfig);
      expect(runArg.status).toBe(DataMartRunStatus.RUNNING);
    });
  });

  describe('markAsCancelled', () => {
    it('marks an active data mart run as cancelled', async () => {
      const { service, dataMartRunRepository, systemClock } = createService();
      const run = {
        id: 'run-1',
        status: DataMartRunStatus.RUNNING,
      } as DataMartRun;

      await expect(service.markAsCancelled(run)).resolves.toBe(true);

      expect(dataMartRunRepository.update).toHaveBeenCalledWith(
        {
          id: 'run-1',
          status: In([DataMartRunStatus.PENDING, DataMartRunStatus.RUNNING]),
        },
        {
          status: DataMartRunStatus.CANCELLED,
          finishedAt: systemClock.now(),
        }
      );
    });

    it('does not overwrite a run that already left an active status', async () => {
      const { service, dataMartRunRepository } = createService();
      dataMartRunRepository.update.mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });
      const run = {
        id: 'run-1',
        status: DataMartRunStatus.RUNNING,
      } as DataMartRun;

      await expect(service.markAsCancelled(run)).resolves.toBe(false);
    });
  });
});
