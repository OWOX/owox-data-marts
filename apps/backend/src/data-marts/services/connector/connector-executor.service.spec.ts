import { OwoxProducer } from '@owox/internal-helpers';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';

jest.mock('@owox/connectors', () => ({
  Core: {
    ConfigDto: jest.fn().mockImplementation(function (this: unknown, data: unknown) {
      Object.assign(this as object, data);
    }),
    EXECUTION_STATUS: {
      ERROR: 'ERROR',
      SUCCESS: 'SUCCESS',
    },
  },
}));

import { ConnectorExecutorService } from './connector-executor.service';
import { ConnectorProcessSpawnerService } from './connector-process-spawner.service';
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { ConnectorSourceConfigService } from './connector-source-config.service';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorOutputCaptureService } from '../../connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorStateService } from '../../connector-types/connector-message/services/connector-state.service';
import { ConsumptionTrackingService } from '../consumption-tracking.service';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { ProjectBalanceService } from '../project-balance.service';
import { DataMartService } from '../data-mart.service';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import { Repository } from 'typeorm';

describe('ConnectorExecutorService', () => {
  const createService = () => {
    const dataMartRunRepository = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<DataMartRun>;

    // Capture the onMessage callback so spawnConnector can invoke it with a success message
    let capturedOnMessage: ((msg: unknown) => void) | null = null;

    const outputCaptureService = {
      createCapture: jest.fn().mockImplementation((onMessage: (msg: unknown) => void) => {
        capturedOnMessage = onMessage;
        return {
          logCapture: { onStdout: jest.fn(), onStderr: jest.fn() },
          onSpawn: jest.fn(),
        };
      }),
    } as unknown as ConnectorOutputCaptureService;

    const processSpawner = {
      spawnConnector: jest.fn().mockImplementation(() => {
        // Simulate a successful connector run by triggering a STATUS SUCCESS message
        if (capturedOnMessage) {
          capturedOnMessage({
            type: ConnectorMessageType.STATUS,
            status: 'SUCCESS',
            at: new Date().toISOString(),
            toFormattedString: () => 'STATUS: SUCCESS',
          });
        }
        return Promise.resolve();
      }),
    } as unknown as ConnectorProcessSpawnerService;

    const storageConfigService = {
      buildStorageConfig: jest.fn().mockResolvedValue({ toObject: () => ({}) }),
    } as unknown as ConnectorStorageConfigService;

    const sourceConfigService = {
      buildSourceConfig: jest.fn().mockResolvedValue({ toObject: () => ({}) }),
      buildRunConfig: jest.fn().mockReturnValue({ toObject: () => ({}) }),
    } as unknown as ConnectorSourceConfigService;

    const credentialInjector = {
      refreshCredentialsForConfig: jest
        .fn()
        .mockImplementation((_p, _c, config) => Promise.resolve(config)),
    } as unknown as ConnectorCredentialInjectorService;

    const connectorStateService = {
      getState: jest.fn().mockResolvedValue(null),
      updateState: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConnectorStateService;

    const consumptionTracker = {
      registerConnectorRunConsumption: jest.fn().mockResolvedValue(undefined),
    } as unknown as ConsumptionTrackingService;

    const gracefulShutdownService = {
      registerActiveProcess: jest.fn(),
      unregisterActiveProcess: jest.fn(),
      isInShutdownMode: jest.fn().mockReturnValue(false),
      updateProcessPid: jest.fn(),
    } as unknown as GracefulShutdownService;

    const systemTimeService = {
      now: jest.fn().mockReturnValue(new Date('2025-01-15')),
    } as unknown as SystemTimeService;

    const producer = {
      produceEvent: jest.fn().mockResolvedValue(undefined),
    };

    const projectBalanceService = {
      verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProjectBalanceService;

    const dataMartService = {
      actualizeSchema: jest.fn().mockResolvedValue(undefined),
    } as unknown as DataMartService;

    const service = new ConnectorExecutorService(
      dataMartRunRepository,
      processSpawner,
      storageConfigService,
      sourceConfigService,
      credentialInjector,
      outputCaptureService,
      connectorStateService,
      consumptionTracker,
      gracefulShutdownService,
      systemTimeService,
      producer as unknown as OwoxProducer,
      projectBalanceService,
      dataMartService
    );

    return {
      service,
      dataMartRunRepository,
      processSpawner,
      storageConfigService,
      sourceConfigService,
      credentialInjector,
      outputCaptureService,
      connectorStateService,
      consumptionTracker,
      gracefulShutdownService,
      systemTimeService,
      producer,
      projectBalanceService,
      dataMartService,
    };
  };

  const createDataMart = (overrides = {}): DataMart =>
    ({
      id: 'dm-1',
      projectId: 'proj-1',
      definition: {
        connector: {
          source: {
            name: 'TestConnector',
            node: 'test_node',
            fields: ['field1'],
            configuration: [{ _id: 'cfg-1', param: 'val' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
      storage: { type: 'GOOGLE_BIGQUERY', config: {} },
      ...overrides,
    }) as unknown as DataMart;

  const createRun = (overrides = {}): DataMartRun =>
    ({
      id: 'run-1',
      dataMartId: 'dm-1',
      status: DataMartRunStatus.RUNNING,
      createdById: 'user-1',
      runType: 'MANUAL',
      ...overrides,
    }) as unknown as DataMartRun;

  it('executes successfully and updates status to SUCCESS', async () => {
    const { service, dataMartRunRepository, consumptionTracker, producer, dataMartService } =
      createService();

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(dataMartRunRepository.update).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: DataMartRunStatus.RUNNING })
    );
    expect(consumptionTracker.registerConnectorRunConsumption).toHaveBeenCalled();
    expect(producer.produceEvent).toHaveBeenCalled();
    expect(dataMartService.actualizeSchema).toHaveBeenCalledWith('dm-1', 'proj-1');
  });

  it('skips execution in shutdown mode', async () => {
    const { service, gracefulShutdownService, processSpawner } = createService();
    (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(true);

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(processSpawner.spawnConnector).not.toHaveBeenCalled();
  });

  it('handles balance check failure', async () => {
    const { service, projectBalanceService, dataMartRunRepository } = createService();
    const { ProjectOperationBlockedException } =
      await import('../../../common/exceptions/project-operation-blocked.exception');
    (projectBalanceService.verifyCanPerformOperations as jest.Mock).mockRejectedValue(
      new ProjectOperationBlockedException([ProjectBlockedReason.OVERDRAFT_LIMIT_EXCEEDED])
    );

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(dataMartRunRepository.update).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: DataMartRunStatus.RESTRICTED })
    );
  });

  it('skips configuration without _id', async () => {
    const { service, processSpawner } = createService();
    const dm = createDataMart({
      definition: {
        connector: {
          source: {
            name: 'TestConnector',
            node: 'test_node',
            fields: ['f1'],
            configuration: [{ param: 'val' }], // no _id
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });

    await service.executeInBackground(dm, createRun(), null);

    expect(processSpawner.spawnConnector).not.toHaveBeenCalled();
  });

  it('unregisters active process in finally block', async () => {
    const { service, gracefulShutdownService, processSpawner } = createService();
    (processSpawner.spawnConnector as jest.Mock).mockRejectedValue(new Error('spawn failed'));

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(gracefulShutdownService.unregisterActiveProcess).toHaveBeenCalled();
  });

  it('continues even when actualizeSchema fails', async () => {
    const { service, dataMartService, gracefulShutdownService } = createService();
    (dataMartService.actualizeSchema as jest.Mock).mockRejectedValue(new Error('schema error'));

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(gracefulShutdownService.unregisterActiveProcess).toHaveBeenCalled();
  });

  it('does not set startedAt when run has INTERRUPTED status (mergeWithExisting=true)', async () => {
    const { service, dataMartRunRepository } = createService();

    await service.executeInBackground(
      createDataMart(),
      createRun({ status: DataMartRunStatus.INTERRUPTED }),
      null
    );

    const updateCall = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.RUNNING
    );

    expect(updateCall).toBeDefined();
    expect(updateCall![1]).not.toHaveProperty('startedAt');
  });
});
