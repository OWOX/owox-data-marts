import { Repository, DataSource, EntityManager, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ConnectorRunTriggerHandlerService } from './connector-run-trigger-handler.service';
import { ConnectorExecutionService } from './connector-execution.service';
import { DataMartRunService } from '../data-mart-run.service';
import { DataMartService } from '../data-mart.service';
import { ConnectorRunTrigger } from '../../entities/connector-run-trigger.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { TriggerStatus } from '../../../common/scheduler/shared/entities/trigger-status';
import { SchedulerFacade } from '../../../common/scheduler/shared/scheduler.facade';
describe('ConnectorRunTriggerHandlerService', () => {
  const createService = () => {
    const triggerRepository = {
      save: jest.fn().mockImplementation(data => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<ConnectorRunTrigger>;

    const dataMartRunRepository = {
      save: jest.fn().mockImplementation(data => Promise.resolve(data)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    } as unknown as Repository<DataMartRun>;

    const schedulerFacade = {
      registerTriggerHandler: jest.fn().mockResolvedValue(undefined),
    } as unknown as SchedulerFacade;

    const connectorExecutionService = {
      executeExistingRun: jest.fn().mockResolvedValue(undefined),
      run: jest.fn().mockResolvedValue('run-2'),
    } as unknown as ConnectorExecutionService;

    const dataMartService = {
      getByIdAndProjectId: jest.fn(),
    } as unknown as DataMartService;

    const dataMartRunService = {
      findById: jest.fn(),
    } as unknown as DataMartRunService;

    const configService = {
      get: jest.fn().mockReturnValue(3),
    } as unknown as ConfigService;

    const mockManager = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      }),
      findOneOrFail: jest.fn(),
    } as unknown as EntityManager;

    const dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((fn: (em: EntityManager) => Promise<unknown>) => fn(mockManager)),
    } as unknown as DataSource;

    const service = new ConnectorRunTriggerHandlerService(
      triggerRepository,
      dataMartRunRepository,
      schedulerFacade,
      connectorExecutionService,
      dataMartService,
      dataMartRunService,
      configService,
      dataSource
    );

    return {
      service,
      triggerRepository,
      dataMartRunRepository,
      schedulerFacade,
      connectorExecutionService,
      dataMartService,
      dataMartRunService,
      configService,
      dataSource,
      mockManager,
    };
  };

  const mockDataMart = {
    id: 'dm-1',
    projectId: 'proj-1',
    definition: {},
  } as unknown as DataMart;

  const mockRun = {
    id: 'run-1',
    status: DataMartRunStatus.RUNNING,
  } as unknown as DataMartRun;

  const mockTrigger = {
    id: 'trigger-1',
    dataMartId: 'dm-1',
    projectId: 'proj-1',
    dataMartRunId: 'run-1',
    status: TriggerStatus.PROCESSING,
    isActive: true,
    payload: null,
  } as unknown as ConnectorRunTrigger;

  describe('handleTrigger', () => {
    it('executes the run on happy path', async () => {
      const { service, dataMartService, connectorExecutionService, mockManager } = createService();

      (dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);
      (mockManager.findOneOrFail as jest.Mock).mockResolvedValue(mockRun);

      await service.handleTrigger(mockTrigger);

      expect(dataMartService.getByIdAndProjectId).toHaveBeenCalledWith('dm-1', 'proj-1');
      expect(connectorExecutionService.executeExistingRun).toHaveBeenCalledWith(
        mockDataMart,
        mockRun,
        null,
        undefined
      );
    });

    it('resets trigger to IDLE when concurrency limit is exceeded', async () => {
      const { service, dataMartService, triggerRepository, mockManager } = createService();

      (dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);

      // Simulate concurrency limit reached
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(3),
      };
      (mockManager.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      (mockManager.update as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.handleTrigger(mockTrigger);

      expect(triggerRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TriggerStatus.IDLE,
          isActive: true,
        })
      );
    });

    it('propagates non-concurrency errors', async () => {
      const { service, dataMartService, dataMartRunService } = createService();

      const error = new Error('execution failed');
      (dataMartService.getByIdAndProjectId as jest.Mock).mockRejectedValue(error);
      (dataMartRunService.findById as jest.Mock).mockResolvedValue(null);

      await expect(service.handleTrigger(mockTrigger)).rejects.toThrow('execution failed');
    });

    it('skips duplicate trigger when run is already RUNNING', async () => {
      const { service, dataMartService, dataMartRunService, dataMartRunRepository, mockManager } =
        createService();

      (dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);
      // Simulate claim failure — run is no longer PENDING
      (mockManager.update as jest.Mock).mockResolvedValue({ affected: 0 });
      // Run is already RUNNING from a previous trigger processing
      (dataMartRunService.findById as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: DataMartRunStatus.RUNNING,
      });

      await service.handleTrigger(mockTrigger);

      // Should NOT fail the run
      expect(dataMartRunRepository.save).not.toHaveBeenCalled();
    });

    it('marks trigger cancelled and skips execution when run is already CANCELLED', async () => {
      const {
        service,
        dataMartService,
        dataMartRunService,
        triggerRepository,
        connectorExecutionService,
        mockManager,
      } = createService();

      (dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);
      (mockManager.update as jest.Mock).mockResolvedValue({ affected: 0 });
      (dataMartRunService.findById as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: DataMartRunStatus.CANCELLED,
      });

      await expect(service.handleTrigger(mockTrigger)).resolves.toBeUndefined();

      expect(triggerRepository.update).toHaveBeenCalledWith(
        { id: 'trigger-1', status: In([TriggerStatus.PROCESSING, TriggerStatus.CANCELLING]) },
        { status: TriggerStatus.CANCELLED, isActive: false, version: expect.any(Function) }
      );
      expect(connectorExecutionService.executeExistingRun).not.toHaveBeenCalled();
    });

    it('marks trigger cancelled after execution is aborted by scheduler signal', async () => {
      const {
        service,
        dataMartService,
        triggerRepository,
        connectorExecutionService,
        mockManager,
      } = createService();
      const abortController = new AbortController();
      const trigger = Object.assign(new ConnectorRunTrigger(), mockTrigger);
      const logSpy = jest
        .spyOn((service as unknown as { logger: { log: (message: string) => void } }).logger, 'log')
        .mockImplementation();

      (dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);
      (mockManager.findOneOrFail as jest.Mock).mockResolvedValue(mockRun);
      (connectorExecutionService.executeExistingRun as jest.Mock).mockImplementation(async () => {
        abortController.abort();
      });

      await service.handleTrigger(trigger, { signal: abortController.signal });

      expect(triggerRepository.update).toHaveBeenCalledWith(
        { id: 'trigger-1', status: In([TriggerStatus.PROCESSING, TriggerStatus.CANCELLING]) },
        { status: TriggerStatus.CANCELLED, isActive: false, version: expect.any(Function) }
      );
      trigger.onSuccess(new Date('2026-06-04T12:00:00.000Z'));
      expect(trigger.status).toBe(TriggerStatus.CANCELLED);
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('already CANCELLED'));
    });

    describe('split manual backfill', () => {
      const chain = { startDate: '2026-06-01', endDate: '2026-09-15', totalChunks: 4 };
      const finishedChunk = (status: DataMartRunStatus, chunkIndex = 0) => ({
        id: 'run-1',
        status,
        createdById: 'user-1',
        runType: 'manual',
        errors: [],
        additionalParams: {
          payload: {
            runType: 'MANUAL_BACKFILL',
            data: { StartDate: '2026-06-01', EndDate: '2026-07-01', AccountId: '42' },
            backfillChain: { ...chain, chunkIndex },
          },
        },
      });

      const runChunk = async (finished: unknown) => {
        const deps = createService();
        (deps.dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);
        (deps.mockManager.findOneOrFail as jest.Mock).mockResolvedValue(mockRun);
        (deps.dataMartRunService.findById as jest.Mock).mockResolvedValue(finished);
        await deps.service.handleTrigger(mockTrigger);
        return deps;
      };

      it.each([DataMartRunStatus.SUCCESS, DataMartRunStatus.FAILED])(
        'enqueues the next chunk after a %s chunk',
        async status => {
          const { connectorExecutionService } = await runChunk(finishedChunk(status));

          expect(connectorExecutionService.run).toHaveBeenCalledWith(
            mockDataMart,
            'user-1',
            'manual',
            {
              runType: 'MANUAL_BACKFILL',
              data: { StartDate: '2026-07-02', EndDate: '2026-08-01', AccountId: '42' },
              backfillChain: { ...chain, chunkIndex: 1 },
            }
          );
        }
      );

      it.each([
        DataMartRunStatus.CANCELLED,
        DataMartRunStatus.RESTRICTED,
        DataMartRunStatus.INTERRUPTED,
      ])('does not enqueue the next chunk after a %s chunk', async status => {
        const { connectorExecutionService } = await runChunk(finishedChunk(status));

        expect(connectorExecutionService.run).not.toHaveBeenCalled();
      });

      it('stops after the last chunk and ignores runs without a chain', async () => {
        const last = await runChunk(finishedChunk(DataMartRunStatus.SUCCESS, 3));
        expect(last.connectorExecutionService.run).not.toHaveBeenCalled();

        const plain = await runChunk({ id: 'run-1', status: DataMartRunStatus.SUCCESS });
        expect(plain.connectorExecutionService.run).not.toHaveBeenCalled();
      });

      it('records on the finished run why the chain could not continue', async () => {
        const deps = createService();
        (deps.dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);
        (deps.mockManager.findOneOrFail as jest.Mock).mockResolvedValue(mockRun);
        (deps.dataMartRunService.findById as jest.Mock).mockResolvedValue(
          finishedChunk(DataMartRunStatus.SUCCESS)
        );
        (deps.connectorExecutionService.run as jest.Mock).mockRejectedValue(
          new Error('DataMart is not published')
        );

        await expect(deps.service.handleTrigger(mockTrigger)).resolves.toBeUndefined();

        expect(deps.dataMartRunRepository.update).toHaveBeenCalledWith(
          { id: 'run-1' },
          {
            errors: [
              expect.stringContaining(
                'Failed to start backfill run 2/4 (2026-07-02 - 2026-08-01): DataMart is not published'
              ),
            ],
          }
        );
      });
    });

    it('fails the run when claim fails and run is not RUNNING', async () => {
      const { service, dataMartService, dataMartRunService, mockManager } = createService();

      (dataMartService.getByIdAndProjectId as jest.Mock).mockResolvedValue(mockDataMart);
      (mockManager.update as jest.Mock).mockResolvedValue({ affected: 0 });
      // Run is in some other non-RUNNING state (e.g. PENDING changed by another process)
      (dataMartRunService.findById as jest.Mock).mockResolvedValue({
        id: 'run-1',
        status: DataMartRunStatus.FAILED,
      });

      await expect(service.handleTrigger(mockTrigger)).rejects.toThrow(
        'is not in PENDING status, cannot claim'
      );
    });
  });
});
