import { Repository } from 'typeorm';
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

const context: ReportRunContext = { createdById: 'user-1', runType: RunType.manual };

describe('DataMartRunService', () => {
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
});
