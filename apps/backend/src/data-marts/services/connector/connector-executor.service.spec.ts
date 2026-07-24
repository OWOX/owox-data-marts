import { OwoxEventDispatcher } from '../../../common/event-dispatcher/owox-event-dispatcher';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';

jest.mock('@owox/connectors', () => ({
  Core: {
    ConfigDto: jest.fn().mockImplementation(function (this: unknown, data: unknown) {
      Object.assign(this as object, data);
    }),
    EXECUTION_STATUS: {
      IMPORT_IN_PROGRESS: 1,
      IMPORT_DONE: 3,
      ERROR: 5,
    },
    GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD: 'generated_refresh_token',
  },
}));

import { ConnectorExecutorService } from './connector-executor.service';
import { ConnectorProcessSpawnerService } from './connector-process-spawner.service';
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { ConnectorSourceConfigService } from './connector-source-config.service';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
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
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<DataMartRun>;

    // Capture the onMessage callback so spawnConnector can emit connector status messages.
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

    const emitSuccessMessage = () => {
      if (capturedOnMessage) {
        capturedOnMessage({
          type: ConnectorMessageType.STATUS,
          status: 3,
          at: new Date().toISOString(),
          toFormattedString: () => 'STATUS: IMPORT_DONE',
        });
      }
    };

    const emitInProgressMessage = () => {
      if (capturedOnMessage) {
        capturedOnMessage({
          type: ConnectorMessageType.STATUS,
          status: 1,
          at: new Date().toISOString(),
          toFormattedString: () => 'STATUS: IMPORT_IN_PROGRESS',
        });
      }
    };

    const processSpawner = {
      spawnConnector: jest.fn().mockImplementation(() => {
        // Simulate a successful connector run by triggering terminal import status.
        emitSuccessMessage();
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

    const eventDispatcher = {
      publishExternal: jest.fn().mockResolvedValue(undefined),
    };

    const projectBalanceService = {
      verifyCanPerformOperations: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProjectBalanceService;

    const dataMartService = {
      actualizeSchema: jest.fn().mockResolvedValue(undefined),
    } as unknown as DataMartService;

    const connectorSourceCredentialsService = {
      updateCredentialFields: jest.fn().mockResolvedValue(undefined),
      getCredentialsById: jest.fn().mockResolvedValue(null),
    } as unknown as ConnectorSourceCredentialsService;

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
      eventDispatcher as unknown as OwoxEventDispatcher,
      projectBalanceService,
      dataMartService,
      connectorSourceCredentialsService
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
      eventDispatcher,
      projectBalanceService,
      dataMartService,
      emitSuccessMessage,
      emitInProgressMessage,
      connectorSourceCredentialsService,
      emitMessage: (message: unknown) => capturedOnMessage?.(message),
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

  const getFirstSourceConfig = (dataMart: DataMart): Record<string, unknown> => {
    const definition = dataMart.definition as {
      connector: { source: { configuration: Array<Record<string, unknown>> } };
    };

    return definition.connector.source.configuration[0];
  };

  it('executes successfully and updates status to SUCCESS', async () => {
    const { service, dataMartRunRepository, consumptionTracker, eventDispatcher, dataMartService } =
      createService();

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(dataMartRunRepository.update).toHaveBeenCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.RUNNING })
    );
    expect(consumptionTracker.registerConnectorRunConsumption).toHaveBeenCalled();
    expect(eventDispatcher.publishExternal).toHaveBeenCalled();
    expect(dataMartService.actualizeSchema).toHaveBeenCalledWith('dm-1', 'proj-1');
  });

  it('does not mark a run successful when only import in-progress status is emitted', async () => {
    const {
      service,
      dataMartRunRepository,
      processSpawner,
      consumptionTracker,
      eventDispatcher,
      emitInProgressMessage,
    } = createService();
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitInProgressMessage();
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(dataMartRunRepository.update).toHaveBeenLastCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.FAILED })
    );
    expect(consumptionTracker.registerConnectorRunConsumption).not.toHaveBeenCalled();
    expect(eventDispatcher.publishExternal).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ status: 'unsuccessfully' }),
      })
    );
  });

  // Mimics a real conditional UPDATE ... WHERE status IN (:...statuses): the write
  // only applies if the row's current status is still in the expected set.
  const stubConditionalUpdate = (
    dataMartRunRepository: Repository<DataMartRun>,
    state: { current: DataMartRunStatus; statusHistory: DataMartRunStatus[] }
  ) => {
    (dataMartRunRepository.update as jest.Mock).mockImplementation(
      async (
        criteria: { id: string; status?: { _value?: DataMartRunStatus[] } },
        update: { status?: DataMartRunStatus }
      ) => {
        const expected = criteria.status?._value;
        if (expected && !expected.includes(state.current)) {
          return { affected: 0 };
        }
        if (update.status) {
          state.statusHistory.push(update.status);
          state.current = update.status;
        }
        return { affected: 1 };
      }
    );
  };

  it('does not let a stray completion overwrite a committed cancellation when abort is not delivered', async () => {
    const {
      service,
      dataMartRunRepository,
      processSpawner,
      consumptionTracker,
      eventDispatcher,
      emitSuccessMessage,
    } = createService();
    const state = { current: DataMartRunStatus.RUNNING, statusHistory: [] as DataMartRunStatus[] };
    stubConditionalUpdate(dataMartRunRepository, state);
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      // Simulate the cancel endpoint committing CANCELLED while this worker keeps running,
      // unaware the abort signal never reached it.
      state.current = DataMartRunStatus.CANCELLED;
      state.statusHistory.push(DataMartRunStatus.CANCELLED);
      emitSuccessMessage();
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    // The stray SUCCESS write must never land: the guarded update only fires while
    // the run is non-terminal, and the row was already CANCELLED underneath it.
    expect(state.statusHistory).toEqual([DataMartRunStatus.RUNNING, DataMartRunStatus.CANCELLED]);
    // And since the persisted status is CANCELLED, the project must not be billed
    // and no success/failure webhook may fire for this run.
    expect(consumptionTracker.registerConnectorRunConsumption).not.toHaveBeenCalled();
    expect(eventDispatcher.publishExternal).not.toHaveBeenCalled();
  });

  it('does not start the connector when the run reached a terminal status before execution', async () => {
    const { service, dataMartRunRepository, processSpawner, eventDispatcher } = createService();
    // Cancel landed between claimRunSlotAtomically and executeInBackground:
    // the row is already CANCELLED when the initial guarded RUNNING write runs.
    const state = {
      current: DataMartRunStatus.CANCELLED,
      statusHistory: [] as DataMartRunStatus[],
    };
    stubConditionalUpdate(dataMartRunRepository, state);

    await service.executeInBackground(createDataMart(), createRun(), null);

    // The run must not be resurrected to RUNNING, the connector must not spawn,
    // and no outcome events may fire for a run the user already cancelled.
    expect(state.statusHistory).toEqual([]);
    expect(processSpawner.spawnConnector).not.toHaveBeenCalled();
    expect(eventDispatcher.publishExternal).not.toHaveBeenCalled();
  });

  it('still persists captured logs when the terminal status write is skipped', async () => {
    const { service, dataMartRunRepository, processSpawner, emitSuccessMessage } = createService();
    const state = { current: DataMartRunStatus.RUNNING, statusHistory: [] as DataMartRunStatus[] };
    stubConditionalUpdate(dataMartRunRepository, state);
    (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue({
      logs: [JSON.stringify({ type: 'log', message: 'earlier log' })],
      errors: [],
    });
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      state.current = DataMartRunStatus.CANCELLED;
      emitSuccessMessage();
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    // The status write is correctly skipped, but the log trail must survive:
    // it is the only record of what ran before the cancellation landed.
    const logsOnlyUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1].logs !== undefined && call[1].status === undefined
    );
    expect(logsOnlyUpdate).toBeDefined();
    expect(logsOnlyUpdate![1].logs.join()).toContain('earlier log');
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
      { id: 'run-1', status: expect.anything() },
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

  it('does not reset startedAt when resuming a run that already has one', async () => {
    const { service, dataMartRunRepository } = createService();
    // startedAt is set once, on the first attempt, and survives the
    // INTERRUPTED -> PENDING -> RUNNING churn so Run History keeps the
    // original start time.
    await service.executeInBackground(
      createDataMart(),
      createRun({ startedAt: new Date('2025-01-01') }),
      null
    );

    const updateCall = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.RUNNING
    );

    expect(updateCall).toBeDefined();
    expect(updateCall![1]).not.toHaveProperty('startedAt');
  });

  it('merges pre-interruption logs even for a run interrupted before startedAt was ever set', async () => {
    const { service, dataMartRunRepository, emitInProgressMessage, processSpawner } =
      createService();
    (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue({
      logs: [JSON.stringify({ type: 'log', message: 'pre-interruption log' })],
      errors: [JSON.stringify({ type: 'error', error: 'pre-interruption error' })],
    });
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitInProgressMessage();
    });

    // No startedAt override: a run interrupted before its first RUNNING write
    // (e.g. shutdown hit during the balance check) resumes with startedAt null.
    // Merging must not depend on any per-run resume flag — it always happens.
    await service.executeInBackground(createDataMart(), createRun(), null);

    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.FAILED
    );

    expect(finalUpdate).toBeDefined();
    expect(finalUpdate![1].logs.join()).toContain('pre-interruption log');
    expect(finalUpdate![1].errors.join()).toContain('pre-interruption error');
  });

  it('caps merged logs so repeatedly resumed runs cannot grow the column without bound', async () => {
    const { service, dataMartRunRepository, emitInProgressMessage, processSpawner } =
      createService();
    // A run resumed many times would otherwise concatenate its whole history
    // on every attempt until the json column outgrows max_allowed_packet.
    const existingLogs = Array.from({ length: 12000 }, (_, i) =>
      JSON.stringify({ type: 'log', message: `old entry ${i}` })
    );
    (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue({
      logs: existingLogs,
      errors: [],
    });
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitInProgressMessage();
    });

    await service.executeInBackground(
      createDataMart(),
      createRun({ startedAt: new Date('2025-01-01') }),
      null
    );

    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.FAILED
    );

    // Capped to the limit, with the truncation notice counted inside it.
    expect(finalUpdate![1].logs).toHaveLength(10000);
    expect(finalUpdate![1].logs[0]).toContain('earlier entries from previous attempts');
    // The tail is what survives — it shows where the run actually got to.
    expect(finalUpdate![1].logs.at(-1)).toContain(ConnectorMessageType.STATUS);
    // The oldest entries are the ones dropped.
    expect(finalUpdate![1].logs.join()).not.toContain('old entry 0"');
  });

  it('caps merged logs by serialized bytes so oversized entries cannot exceed the packet limit', async () => {
    const { service, dataMartRunRepository, emitInProgressMessage, processSpawner } =
      createService();
    // Far fewer entries than the count cap, but each ~3MB: count alone would
    // pass all of them through and the single UPDATE would blow past MySQL's
    // max_allowed_packet. The 6MB byte budget must bite instead.
    const hugeEntries = Array.from({ length: 4 }, (_, i) =>
      JSON.stringify({ type: 'log', message: `huge entry ${i} ${'x'.repeat(3_000_000)}` })
    );
    (dataMartRunRepository.findOne as jest.Mock).mockResolvedValue({
      logs: hugeEntries,
      errors: [],
    });
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitInProgressMessage();
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.FAILED
    );

    const logs = finalUpdate![1].logs as string[];
    expect(logs[0]).toContain('earlier entries from previous attempts');
    // Only what fits in the byte budget survives, newest first from the tail.
    const serializedBytes = Buffer.byteLength(JSON.stringify(logs));
    expect(serializedBytes).toBeLessThan(7 * 1024 * 1024);
    expect(logs.join()).toContain('huge entry 3');
    expect(logs.join()).not.toContain('huge entry 0');
  });

  it('marks an aborted connector run as CANCELLED', async () => {
    const { service, dataMartRunRepository, processSpawner, eventDispatcher } = createService();
    const controller = new AbortController();
    controller.abort();
    (processSpawner.spawnConnector as jest.Mock).mockRejectedValue(
      new Error('Connector process was aborted')
    );

    await service.executeInBackground(createDataMart(), createRun(), null, controller.signal);

    expect(dataMartRunRepository.update).toHaveBeenLastCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.CANCELLED })
    );
    expect(eventDispatcher.publishExternal).not.toHaveBeenCalled();
  });

  it('keeps an aborted connector run CANCELLED during graceful shutdown', async () => {
    const { service, dataMartRunRepository, gracefulShutdownService } = createService();
    const controller = new AbortController();
    controller.abort();
    (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(true);

    await service.executeInBackground(createDataMart(), createRun(), null, controller.signal);

    expect(dataMartRunRepository.update).toHaveBeenLastCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.CANCELLED })
    );
  });

  it('registers consumption when abort arrives after a successful connector upload', async () => {
    const {
      service,
      dataMartRunRepository,
      processSpawner,
      consumptionTracker,
      eventDispatcher,
      emitSuccessMessage,
    } = createService();
    const controller = new AbortController();
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitSuccessMessage();
      controller.abort();
    });

    await service.executeInBackground(createDataMart(), createRun(), null, controller.signal);

    expect(dataMartRunRepository.update).toHaveBeenLastCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.SUCCESS })
    );
    expect(consumptionTracker.registerConnectorRunConsumption).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dm-1' }),
      'run-1'
    );
    expect(eventDispatcher.publishExternal).toHaveBeenCalled();
  });

  it('only saves allowed credential updates from connector messages', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: {
          generated_refresh_token: 'generated-refresh-token',
          'AuthType.oauth2.RefreshToken': 'should-not-be-saved',
        },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).toHaveBeenCalledWith(
      'cred-1',
      'proj-1',
      { generated_refresh_token: 'generated-refresh-token' }
    );
  });

  it('saves credential updates even when connector run fails after token rotation', async () => {
    const { service, processSpawner, connectorSourceCredentialsService, emitMessage } =
      createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'generated-refresh-token' },
      });
      return Promise.reject(new Error('storage failed'));
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).toHaveBeenCalledWith(
      'cred-1',
      'proj-1',
      { generated_refresh_token: 'generated-refresh-token' }
    );
  });

  it('saves the latest accumulated credential update', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'first-token' },
      });
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'latest-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).toHaveBeenCalledWith(
      'cred-1',
      'proj-1',
      { generated_refresh_token: 'latest-token' }
    );
  });

  it('passes the pre-run generated refresh token snapshot when saving credential updates', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';
    (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mockResolvedValue({
      id: 'cred-1',
      projectId: 'proj-1',
      credentials: { generated_refresh_token: 'old-token' },
    });

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'new-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.getCredentialsById).toHaveBeenCalledWith('cred-1');
    expect(
      (connectorSourceCredentialsService.getCredentialsById as jest.Mock).mock
        .invocationCallOrder[0]
    ).toBeLessThan((processSpawner.spawnConnector as jest.Mock).mock.invocationCallOrder[0]);
    expect(connectorSourceCredentialsService.updateCredentialFields).toHaveBeenCalledWith(
      'cred-1',
      'proj-1',
      { generated_refresh_token: 'new-token' },
      { generated_refresh_token: 'old-token' }
    );
  });

  it('uses nested _source_credential_id before stale _secrets_id when saving credential updates', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    const sourceConfig = getFirstSourceConfig(dataMart);
    sourceConfig._secrets_id = 'secrets-cred';
    sourceConfig.AuthType = { oauth2: { _source_credential_id: 'oauth-cred' } };

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'generated-refresh-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).toHaveBeenCalledWith(
      'oauth-cred',
      'proj-1',
      { generated_refresh_token: 'generated-refresh-token' }
    );
  });

  it('uses nested _source_credential_id when _secrets_id is missing', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart).AuthType = {
      oauth2: { _source_credential_id: 'oauth-cred' },
    };

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'generated-refresh-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).toHaveBeenCalledWith(
      'oauth-cred',
      'proj-1',
      { generated_refresh_token: 'generated-refresh-token' }
    );
  });

  it('uses refreshed credential id when saving credential updates', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      credentialInjector,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart).AuthType = {
      oauth2: { _source_credential_id: 'old-oauth-cred' },
    };
    (credentialInjector.refreshCredentialsForConfig as jest.Mock).mockResolvedValue({
      _id: 'cfg-1',
      AuthType: { oauth2: { _source_credential_id: 'new-oauth-cred' } },
    });

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'generated-refresh-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).toHaveBeenCalledWith(
      'new-oauth-cred',
      'proj-1',
      { generated_refresh_token: 'generated-refresh-token' }
    );
  });

  it('skips credential updates for legacy inline configs without credential reference', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'generated-refresh-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).not.toHaveBeenCalled();
  });

  it('ignores invalid generated refresh token values from connector messages', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'x'.repeat(4097) },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorSourceCredentialsService.updateCredentialFields).not.toHaveBeenCalled();
  });

  it('marks run failed when saving credential updates fails', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      emitMessage,
      emitSuccessMessage,
      dataMartRunRepository,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';
    (connectorSourceCredentialsService.updateCredentialFields as jest.Mock).mockRejectedValue(
      new Error('save failed')
    );

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'generated-refresh-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    const finalRunUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls
      .map(call => call[1])
      .find(update => update.status === DataMartRunStatus.FAILED);

    expect(finalRunUpdate).toBeDefined();
    expect(JSON.stringify(finalRunUpdate.errors)).toContain(
      'Failed to update connector credentials: save failed'
    );
  });

  it('does not persist generated refresh token in run logs', async () => {
    const { service, processSpawner, dataMartRunRepository, emitMessage, emitSuccessMessage } =
      createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.CREDENTIALS_UPDATE,
        at: new Date().toISOString(),
        credentials: { generated_refresh_token: 'secret-token' },
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    const persistedRunUpdates = (dataMartRunRepository.update as jest.Mock).mock.calls.map(
      call => call[1]
    );
    expect(JSON.stringify(persistedRunUpdates)).not.toContain('secret-token');
  });
});
