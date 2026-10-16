// connector-run.service.spec.ts
jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { In, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { ConnectorRunService } from './connector-run.service';
import { ConnectorRunTriggerService } from './connector-run-trigger.service';
import { ConnectorExecutorService } from './connector-executor.service';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartDefinitionType } from '../../enums/data-mart-definition-type.enum';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { RunType } from '../../../common/scheduler/shared/types';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';

describe('ConnectorRunService', () => {
  const createService = () => {
    const dataMartRunRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation(data => data),
      save: jest.fn().mockImplementation(data => Promise.resolve({ ...data, id: 'run-1' })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<DataMartRun>;

    const connectorRunTriggerService = {
      createTrigger: jest.fn().mockResolvedValue('trigger-1'),
    } as unknown as ConnectorRunTriggerService;

    const connectorExecutorService = {
      executeInBackground: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConnectorExecutorService;

    const systemTimeService = {
      now: jest.fn().mockReturnValue(new Date('2026-09-17T12:00:00.000Z')),
    } as unknown as SystemTimeService;

    const service = new ConnectorRunService(
      dataMartRunRepository,
      connectorRunTriggerService,
      connectorExecutorService,
      systemTimeService
    );

    return {
      service,
      dataMartRunRepository,
      connectorRunTriggerService,
      connectorExecutorService,
    };
  };

  const publishedConnectorDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definitionType: DataMartDefinitionType.CONNECTOR,
    status: DataMartStatus.PUBLISHED,
    definition: {},
  } as unknown as DataMart;

  describe('run', () => {
    it('creates run and trigger successfully', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue(null); // not running

      const result = await service.run(publishedConnectorDataMart, 'user-1', RunType.manual);

      expect(result).toBe('run-1');
      expect(dataMartRunRepository.save).toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalled();
    });

    it('throws when dataMart is not CONNECTOR type', async () => {
      const { service } = createService();
      const dm = {
        ...publishedConnectorDataMart,
        definitionType: DataMartDefinitionType.SQL,
      } as unknown as DataMart;

      await expect(service.run(dm, 'user-1', RunType.manual)).rejects.toThrow(
        'DataMart is not a connector type'
      );
    });

    it('throws when dataMart is not PUBLISHED', async () => {
      const { service } = createService();
      const dm = {
        ...publishedConnectorDataMart,
        status: DataMartStatus.DRAFT,
      } as unknown as DataMart;

      await expect(service.run(dm, 'user-1', RunType.manual)).rejects.toThrow(
        'DataMart is not published'
      );
    });

    it('normalizes a manual backfill payload before creating the run and trigger', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue(null);

      await service.run(publishedConnectorDataMart, 'user-1', RunType.manual, {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-09-01' },
      });

      const expectedPayload = {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2026-09-01', EndDate: '2026-09-17' },
      };
      expect(dataMartRunRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ additionalParams: { payload: expectedPayload } })
      );
      // The trigger replays the run's additionalParams, the same shape the recovery sweep
      // and the chain use.
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ payload: { payload: expectedPayload } })
      );
    });

    it('plans a backfill longer than one segment as segment 1 of a chain', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue(null);
      // 411 days: 14 segments of at most 31 days.
      const payload = {
        runType: 'MANUAL_BACKFILL',
        data: { StartDate: '2025-08-01', EndDate: '2026-09-15' },
      };

      await service.run(publishedConnectorDataMart, 'user-1', RunType.manual, payload);

      const expectedAdditionalParams = {
        payload: {
          runType: 'MANUAL_BACKFILL',
          data: { StartDate: '2025-08-01', EndDate: '2025-08-31' },
        },
        backfill: {
          id: expect.any(String),
          requestedStart: '2025-08-01',
          requestedEnd: '2026-09-15',
          segmentIndex: 1,
          segmentsTotal: 14,
          segmentDays: 31,
        },
      };
      expect(dataMartRunRepository.save).toHaveBeenCalledTimes(1);
      expect(dataMartRunRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ additionalParams: expectedAdditionalParams })
      );
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalledTimes(1);
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expectedAdditionalParams })
      );
    });

    it('rejects an invalid backfill range before creating a run', async () => {
      const { service, dataMartRunRepository } = createService();
      (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.run(publishedConnectorDataMart, 'user-1', RunType.manual, {
          runType: 'MANUAL_BACKFILL',
          data: { StartDate: '2026-09-18' },
        })
      ).rejects.toThrow('StartDate cannot be in the future');
      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
    });

    it('throws when connector is already running', async () => {
      const { service, dataMartRunRepository } = createService();
      (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue({ id: 'existing-run' });

      await expect(
        service.run(publishedConnectorDataMart, 'user-1', RunType.manual)
      ).rejects.toThrow('Connector is already running');
    });
  });

  describe('executeExistingRun', () => {
    it('delegates to executor', async () => {
      const { service, connectorExecutorService } = createService();
      const dm = publishedConnectorDataMart;
      const run = { id: 'run-1' } as DataMartRun;

      await service.executeExistingRun(dm, run, null);

      expect(connectorExecutorService.executeInBackground).toHaveBeenCalledWith(
        dm,
        run,
        null,
        undefined
      );
    });
  });

  describe('executeInterruptedRuns', () => {
    it('does nothing when no interrupted runs', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([]);

      await service.executeInterruptedRuns();

      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it('creates triggers for interrupted runs', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([
        {
          id: 'run-1',
          dataMartId: 'dm-1',
          type: DataMartRunType.CONNECTOR,
          dataMart: { projectId: 'proj-1' },
          createdById: 'user-1',
          runType: RunType.manual,
          additionalParams: null,
        },
      ]);

      await service.executeInterruptedRuns();

      expect(dataMartRunRepository.update).toHaveBeenCalledWith(
        { id: 'run-1', status: DataMartRunStatus.INTERRUPTED },
        { status: DataMartRunStatus.PENDING }
      );
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalled();
    });

    it('skips resumption when run is no longer INTERRUPTED (e.g. already cancelled)', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([
        {
          id: 'run-1',
          dataMartId: 'dm-1',
          type: DataMartRunType.CONNECTOR,
          dataMart: { projectId: 'proj-1' },
          createdById: 'user-1',
          runType: RunType.manual,
          additionalParams: null,
        },
      ]);
      (dataMartRunRepository.update as jest.Mock).mockResolvedValue({ affected: 0 });

      await service.executeInterruptedRuns();

      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });
  });

  describe('repairBackfillChains', () => {
    const chainMeta = (overrides: Record<string, unknown> = {}) => ({
      id: 'chain-1',
      requestedStart: '2026-01-01',
      requestedEnd: '2026-03-03',
      segmentIndex: 1,
      segmentsTotal: 2,
      ...overrides,
    });

    // Created long before the sweep's 24 h window opens, finished within it: a segment can run
    // for hours, and the sweep must find it by when it finished.
    const segmentRun = (overrides: Record<string, unknown> = {}) => ({
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.CONNECTOR,
      status: DataMartRunStatus.SUCCESS,
      createdById: 'user-1',
      runType: RunType.manual,
      createdAt: new Date('2026-09-15T00:00:00.000Z'),
      finishedAt: new Date('2026-09-17T11:00:00.000Z'),
      additionalParams: {
        payload: {
          runType: 'MANUAL_BACKFILL',
          data: { StartDate: '2026-01-01', EndDate: '2026-01-31' },
        },
        backfill: chainMeta(),
        backfillProgress: { 'cfg-1': '2026-01-31' },
      },
      ...overrides,
    });

    const withDataMart = (run: Record<string, unknown>) => ({
      ...run,
      dataMart: { id: 'dm-1', projectId: 'proj-1', definition: { connector: {} } },
    });

    // The sweep reads through `find` twice (candidates by finishedAt, then the later runs of one
    // data mart) and through `findOne` twice (the candidate with its data mart, then the
    // active-run check). Answers are keyed on the query, so a test cannot pass by call order
    // alone, and the created run gets an id of its own (`run-2`) so assertions can tell it
    // from the stalled one.
    const stubSweep = (
      repository: Repository<DataMartRun>,
      candidates: ReturnType<typeof segmentRun>[],
      { laterRuns = [], activeRun = null }: { laterRuns?: unknown[]; activeRun?: unknown } = {}
    ) => {
      (repository.find as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(where.finishedAt ? candidates : laterRuns)
      );
      (repository.findOne as jest.Mock).mockImplementation(({ where }) =>
        Promise.resolve(
          where.id ? withDataMart(candidates.find(run => run.id === where.id)!) : activeRun
        )
      );
      (repository.save as jest.Mock).mockImplementation(data =>
        Promise.resolve({ ...data, id: 'run-2' })
      );
    };

    it('queues the missing next segment of a stalled chain', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      const stalled = segmentRun();
      stubSweep(dataMartRunRepository, [stalled]);

      await service.repairBackfillChains();

      // Candidates are chosen by status, run type and finish time inside the 24 h window.
      expect(dataMartRunRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: DataMartRunType.CONNECTOR,
            status: In([DataMartRunStatus.SUCCESS, DataMartRunStatus.FAILED]),
            runType: RunType.manual,
            finishedAt: MoreThanOrEqual(new Date('2026-09-16T12:00:00.000Z')),
          },
        })
      );

      const expectedAdditionalParams = {
        payload: {
          runType: 'MANUAL_BACKFILL',
          data: { StartDate: '2026-02-01', EndDate: '2026-03-03' },
        },
        backfill: chainMeta({ segmentIndex: 2 }),
      };
      expect(dataMartRunRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          dataMartId: 'dm-1',
          status: DataMartRunStatus.PENDING,
          additionalParams: expectedAdditionalParams,
        })
      );
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ dataMartRunId: 'run-2', payload: expectedAdditionalParams })
      );
    });

    it('looks for later runs of the data mart from just before the segment finished', async () => {
      const { service, dataMartRunRepository } = createService();
      stubSweep(dataMartRunRepository, [segmentRun()]);

      await service.repairBackfillChains();

      expect(dataMartRunRepository.find).toHaveBeenCalledWith({
        where: {
          dataMartId: 'dm-1',
          type: DataMartRunType.CONNECTOR,
          id: Not('run-1'),
          // 60 s before finishedAt, for the skew between the app and database clocks.
          createdAt: MoreThanOrEqual(new Date('2026-09-17T10:59:00.000Z')),
        },
        select: ['id', 'additionalParams'],
      });
    });

    it('leaves alone a chain that has already run its last segment', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      stubSweep(dataMartRunRepository, [
        segmentRun({
          additionalParams: {
            ...segmentRun().additionalParams,
            backfill: chainMeta({ segmentIndex: 2 }),
          },
        }),
      ]);

      await service.repairBackfillChains();

      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it.each([
      [DataMartRunStatus.CANCELLED],
      [DataMartRunStatus.INTERRUPTED],
      [DataMartRunStatus.PENDING],
      [DataMartRunStatus.FAILED],
    ])('does not requeue a chain whose successor is %s', async successorStatus => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      // Only SUCCESS and FAILED runs are candidates, so a stopped or resumed successor is
      // invisible to the candidate query — the later-run check is what sees it.
      stubSweep(dataMartRunRepository, [segmentRun()], {
        laterRuns: [
          {
            id: 'run-2',
            status: successorStatus,
            additionalParams: { backfill: chainMeta({ segmentIndex: 2 }) },
          },
        ],
      });

      await service.repairBackfillChains();

      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it('does not requeue a chain after the user started a new backfill in the gap', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      stubSweep(dataMartRunRepository, [segmentRun()], {
        laterRuns: [
          {
            id: 'run-5',
            status: DataMartRunStatus.SUCCESS,
            additionalParams: {
              payload: { runType: 'MANUAL_BACKFILL', data: { StartDate: '2026-05-01' } },
            },
          },
          {
            id: 'run-6',
            status: DataMartRunStatus.SUCCESS,
            additionalParams: {
              payload: segmentRun().additionalParams.payload,
              backfill: chainMeta({ id: 'chain-other' }),
            },
          },
        ],
      });

      await service.repairBackfillChains();

      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it('still repairs a chain after a scheduled or incremental run ran in the gap', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      // Neither run touches the backfill or says the user abandoned it, so neither may block
      // the repair — otherwise one hourly schedule would silence every stalled chain.
      stubSweep(dataMartRunRepository, [segmentRun()], {
        laterRuns: [
          {
            id: 'run-7',
            status: DataMartRunStatus.SUCCESS,
            runType: RunType.scheduled,
            additionalParams: null,
          },
          {
            id: 'run-8',
            status: DataMartRunStatus.SUCCESS,
            runType: RunType.manual,
            additionalParams: { payload: { runType: 'INCREMENTAL' } },
          },
        ],
      });

      await service.repairBackfillChains();

      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ dataMartRunId: 'run-2' })
      );
    });

    it('ignores earlier segments of the same chain that fall inside the clock-skew slack', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      const meta = chainMeta({ segmentIndex: 2, segmentsTotal: 3, requestedEnd: '2026-03-31' });
      const stalled = segmentRun({
        id: 'run-2',
        additionalParams: { ...segmentRun().additionalParams, backfill: meta },
      });
      // Two quick segments: the first was created less than 60 s before the second finished.
      stubSweep(dataMartRunRepository, [stalled], {
        laterRuns: [
          {
            id: 'run-1',
            status: DataMartRunStatus.FAILED,
            additionalParams: { backfill: chainMeta({ segmentIndex: 1, segmentsTotal: 3 }) },
          },
        ],
      });

      await service.repairBackfillChains();

      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          dataMartRunId: 'run-2',
          payload: expect.objectContaining({
            payload: {
              runType: 'MANUAL_BACKFILL',
              data: { StartDate: '2026-03-04', EndDate: '2026-03-31' },
            },
          }),
        })
      );
    });

    it('does not queue a segment while another run of the data mart is active', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      stubSweep(dataMartRunRepository, [segmentRun()], {
        activeRun: { id: 'run-9', status: DataMartRunStatus.PENDING },
      });

      await service.repairBackfillChains();

      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it('only considers the chain segment with the highest index', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      // Segment 1 alone would queue segment 2; the latest candidate is the last segment, so the
      // chain is complete and nothing is queued.
      const latest = segmentRun({
        id: 'run-2',
        status: DataMartRunStatus.FAILED,
        additionalParams: {
          payload: segmentRun().additionalParams.payload,
          backfill: chainMeta({ segmentIndex: 2 }),
        },
      });
      stubSweep(dataMartRunRepository, [segmentRun(), latest]);

      await service.repairBackfillChains();

      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });
  });
});
