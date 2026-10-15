// connector-run.service.spec.ts
jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { Repository } from 'typeorm';
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

    const segmentRun = (overrides: Record<string, unknown> = {}) => ({
      id: 'run-1',
      dataMartId: 'dm-1',
      type: DataMartRunType.CONNECTOR,
      status: DataMartRunStatus.SUCCESS,
      createdById: 'user-1',
      runType: RunType.manual,
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

    it('queues the missing next segment of a stalled chain', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      const stalled = segmentRun();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([stalled]);
      // First findOne reloads the run with its data mart; second checks for an active run.
      (dataMartRunRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(withDataMart(stalled))
        .mockResolvedValueOnce(null);

      await service.repairBackfillChains();

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
        expect.objectContaining({ dataMartRunId: 'run-1', payload: expectedAdditionalParams })
      );
    });

    it('leaves alone a chain whose latest segment is alive, stopped, or complete', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([
        segmentRun({ status: DataMartRunStatus.RUNNING }),
        segmentRun({
          id: 'run-2',
          status: DataMartRunStatus.CANCELLED,
          additionalParams: {
            ...segmentRun().additionalParams,
            backfill: chainMeta({ id: 'chain-2' }),
          },
        }),
        segmentRun({
          id: 'run-3',
          additionalParams: {
            ...segmentRun().additionalParams,
            backfill: chainMeta({ id: 'chain-3', segmentIndex: 2 }),
          },
        }),
      ]);

      await service.repairBackfillChains();

      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it('does not queue a segment while another run of the data mart is active', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      const stalled = segmentRun();
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([stalled]);
      (dataMartRunRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(withDataMart(stalled))
        .mockResolvedValueOnce({ id: 'run-9', status: DataMartRunStatus.PENDING });

      await service.repairBackfillChains();

      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });

    it('only considers the chain segment with the highest index', async () => {
      const { service, dataMartRunRepository, connectorRunTriggerService } = createService();
      const latest = segmentRun({
        id: 'run-2',
        status: DataMartRunStatus.CANCELLED,
        additionalParams: {
          payload: segmentRun().additionalParams.payload,
          backfill: chainMeta({ segmentIndex: 2 }),
        },
      });
      (dataMartRunRepository.find as jest.Mock).mockResolvedValue([segmentRun(), latest]);

      await service.repairBackfillChains();

      expect(connectorRunTriggerService.createTrigger).not.toHaveBeenCalled();
    });
  });
});
