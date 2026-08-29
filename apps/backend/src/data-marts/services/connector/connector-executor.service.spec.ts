import { ConfigService } from '@nestjs/config';

// ConnectorRunService (the recovery sweep, exercised below) decorates `run` with
// @Transactional(), which needs an initialized transactional context at import time.
jest.mock('typeorm-transactional', () => ({
  Transactional: () => () => undefined,
}));

import { OwoxEventDispatcher } from '../../../common/event-dispatcher/owox-event-dispatcher';
import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import { ConnectorDefinitionService } from './connector-definition.service';

jest.mock('@owox/connectors', () => ({
  Core: {
    ConfigDto: jest.fn().mockImplementation(function (this: unknown, data: unknown) {
      Object.assign(this as object, data);
    }),
    EXECUTION_STATUS: {
      IMPORT_IN_PROGRESS: 1,
      CLEANUP_IN_PROGRESS: 2,
      IMPORT_DONE: 3,
      CLEANUP_DONE: 4,
      ERROR: 5,
    },
    GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD: 'generated_refresh_token',
    EVENT_TYPE: {
      LOG: 'LOG',
      DATA: 'DATA',
      TRACE: 'TRACE',
      ANALYTICS: 'ANALYTICS',
      STATE: 'STATE',
      CONTROL: 'CONTROL',
      CREDENTIALS: 'CREDENTIALS',
    },
    LOG_LEVEL: {
      INFO: 'info',
      WARN: 'warn',
      ERROR: 'error',
    },
    CONTROL_ACTION: {
      STARTED: 'started',
      COMPLETED: 'completed',
      FAILED: 'failed',
      PAUSED: 'paused',
      CANCELLED: 'cancelled',
    },
  },
}));

import { Logger } from '@nestjs/common';

import { CredentialsExpiredException } from '../../exceptions/google-oauth.exceptions';
import {
  ConnectorExecutorService,
  MAX_MERGED_RUN_OUTPUT_ENTRIES,
} from './connector-executor.service';
import { ConnectorProcessSpawnerService } from './connector-process-spawner.service';
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { ConnectorSourceConfigService } from './connector-source-config.service';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorOutputCaptureService } from '../../connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorStateService } from '../../connector-types/connector-message/services/connector-state.service';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { ProjectBillingService } from '../project-billing/project-billing.service';
import { DataMartService } from '../data-mart.service';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { DataMartRunType } from '../../enums/data-mart-run-type.enum';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { ProjectBlockedReason } from '../../enums/project-blocked-reason.enum';
import { ConnectorRunService } from './connector-run.service';
import { ConnectorRunTriggerService } from './connector-run-trigger.service';
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

    const emitErrorMessage = () => {
      if (capturedOnMessage) {
        capturedOnMessage({
          type: ConnectorMessageType.ERROR,
          at: new Date().toISOString(),
          error: 'HTTP 429: Too Many Requests',
          toFormattedString: () => '[ERROR] HTTP 429: Too Many Requests',
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

    const projectBilling = {
      verifyCanPerformOperations: jest.fn(),
      registerConnectorRunConsumption: jest.fn().mockResolvedValue(undefined),
    } as unknown as ProjectBillingService;

    const dataMartService = {
      actualizeSchema: jest.fn().mockResolvedValue(undefined),
      updateConnectorSourceFields: jest.fn().mockResolvedValue(true),
    } as unknown as DataMartService;

    const connectorSourceCredentialsService = {
      updateCredentialFields: jest
        .fn()
        .mockResolvedValue({ credentials: { id: 'cred-1' }, updated: true }),
      getCredentialsById: jest.fn().mockResolvedValue(null),
    } as unknown as ConnectorSourceCredentialsService;

    const connectorDefinitionService = {
      tryResolveManifest: jest.fn().mockResolvedValue(null),
    } as unknown as ConnectorDefinitionService;

    const configService = {
      get: jest.fn((_key: string, def: unknown) => def),
    } as unknown as ConfigService;

    const service = new ConnectorExecutorService(
      dataMartRunRepository,
      processSpawner,
      storageConfigService,
      sourceConfigService,
      credentialInjector,
      outputCaptureService,
      connectorStateService,
      gracefulShutdownService,
      systemTimeService,
      eventDispatcher as unknown as OwoxEventDispatcher,
      projectBilling,
      dataMartService,
      connectorDefinitionService,
      connectorSourceCredentialsService,
      configService
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
      gracefulShutdownService,
      systemTimeService,
      eventDispatcher,
      projectBilling,
      dataMartService,
      connectorDefinitionService,
      emitSuccessMessage,
      emitInProgressMessage,
      connectorSourceCredentialsService,
      emitMessage: (message: unknown) => capturedOnMessage?.(message),
      emitErrorMessage,
      configService,
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
    const { service, dataMartRunRepository, projectBilling, eventDispatcher, dataMartService } =
      createService();

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(dataMartRunRepository.update).toHaveBeenCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.RUNNING })
    );
    expect(projectBilling.registerConnectorRunConsumption).toHaveBeenCalled();
    expect(eventDispatcher.publishExternal).toHaveBeenCalled();
    expect(dataMartService.actualizeSchema).toHaveBeenCalledWith('dm-1', 'proj-1');
    const successUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.findIndex(
      ([, update]) => update.status === DataMartRunStatus.SUCCESS
    );
    expect(successUpdate).toBeGreaterThanOrEqual(0);
    expect(
      (dataMartRunRepository.update as jest.Mock).mock.invocationCallOrder[successUpdate]
    ).toBeLessThan((dataMartService.actualizeSchema as jest.Mock).mock.invocationCallOrder[0]);
  });

  it('persists sanitized fields emitted by a successful connector run', async () => {
    const {
      service,
      processSpawner,
      emitMessage,
      emitSuccessMessage,
      dataMartService,
      dataMartRunRepository,
    } = createService();
    const dataMart = createDataMart({
      definition: {
        connector: {
          source: {
            name: 'TestConnector',
            node: 'sheet',
            fields: ['custom_product_type', 'deleted_column'],
            configuration: [{ _id: 'cfg-1', param: 'val' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitMessage({
        type: ConnectorMessageType.FIELDS_UPDATE,
        at: new Date().toISOString(),
        fields: [
          '_owox_row_number',
          '_owox_imported_at',
          'custom_product_type',
          'custom_product_type',
          'matched_with',
          ' ',
        ],
        toFormattedString: () => '[FIELDS] 6',
      });
      emitSuccessMessage();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(dataMartService.updateConnectorSourceFields).toHaveBeenCalledWith(dataMart, [
      '_owox_row_number',
      '_owox_imported_at',
      'custom_product_type',
      'matched_with',
    ]);
    const successUpdateIndex = (dataMartRunRepository.update as jest.Mock).mock.calls.findIndex(
      ([, update]) => update.status === DataMartRunStatus.SUCCESS
    );
    expect(successUpdateIndex).toBeGreaterThanOrEqual(0);
    expect(
      (dataMartService.updateConnectorSourceFields as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(
      (dataMartRunRepository.update as jest.Mock).mock.invocationCallOrder[successUpdateIndex]
    );
    expect((dataMartService.actualizeSchema as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (dataMartRunRepository.update as jest.Mock).mock.invocationCallOrder[successUpdateIndex]
    );
  });

  it('does not persist emitted fields when the connector run fails', async () => {
    const { service, processSpawner, emitMessage, dataMartService } = createService();
    const dataMart = createDataMart({
      definition: {
        connector: {
          source: {
            name: 'TestConnector',
            node: 'sheet',
            fields: ['custom_product_type', 'deleted_column'],
            configuration: [{ _id: 'cfg-1', param: 'val' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitMessage({
        type: ConnectorMessageType.FIELDS_UPDATE,
        at: new Date().toISOString(),
        fields: ['_owox_row_number', '_owox_imported_at', 'custom_product_type'],
        toFormattedString: () => '[FIELDS] 3',
      });
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(dataMartService.updateConnectorSourceFields).not.toHaveBeenCalled();
  });

  it('keeps the imported run successful and records a warning when field synchronization fails', async () => {
    const {
      service,
      processSpawner,
      emitMessage,
      emitSuccessMessage,
      dataMartService,
      dataMartRunRepository,
    } = createService();
    const dataMart = createDataMart({
      definition: {
        connector: {
          source: {
            name: 'TestConnector',
            node: 'sheet',
            fields: ['existing', 'deleted_column'],
            configuration: [{ _id: 'cfg-1' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });
    (dataMartService.updateConnectorSourceFields as jest.Mock).mockRejectedValueOnce(
      new Error('database unavailable')
    );
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitMessage({
        type: ConnectorMessageType.FIELDS_UPDATE,
        at: new Date().toISOString(),
        fields: ['_owox_row_number', 'existing'],
        toFormattedString: () => '[FIELDS] 2',
      });
      emitSuccessMessage();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      ([, update]) => update.status === DataMartRunStatus.SUCCESS
    )?.[1];
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate.logs).toEqual(
      expect.arrayContaining([
        expect.stringContaining('source field list could not be synchronized'),
      ])
    );
  });

  it('marks a run FAILED when a terminal IMPORT_DONE is emitted alongside a hard error', async () => {
    // A per-account 429 (after retries) logs an ERROR, but the connector still
    // emits IMPORT_DONE. The import is incomplete → the run must NOT be SUCCESS.
    const { service, dataMartRunRepository, processSpawner, emitSuccessMessage, emitErrorMessage } =
      createService();
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitErrorMessage();
      emitSuccessMessage(); // IMPORT_DONE arrives even though an account failed
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    // The terminal write is guarded so a concurrently committed cancel wins, hence the
    // criteria object rather than a bare id.
    expect(dataMartRunRepository.update).toHaveBeenLastCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.FAILED })
    );
  });

  it('keeps a run SUCCESS when a recovered-from warning is logged alongside IMPORT_DONE', async () => {
    // A WARNING is how the engine reports something it RECOVERED from: MicrosoftAds
    // "Scope … failed, trying next scope…" fires when the NEXT scope succeeds, and
    // GoogleBigQueryStorage "Reducing batch size" fires when the halved MERGE succeeds.
    // Demoting on those recorded a completed import as FAILED — which also skipped
    // billing and fired a failure notification.
    const {
      service,
      dataMartRunRepository,
      processSpawner,
      projectBilling,
      emitSuccessMessage,
      emitMessage,
    } = createService();
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitMessage({
        type: ConnectorMessageType.WARNING,
        at: new Date().toISOString(),
        warning: 'Scope ads.read failed, trying next scope...',
        toFormattedString: () => '[WARNING] Scope ads.read failed, trying next scope...',
      });
      emitSuccessMessage();
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(dataMartRunRepository.update).toHaveBeenLastCalledWith(
      { id: 'run-1', status: expect.anything() },
      expect.objectContaining({ status: DataMartRunStatus.SUCCESS })
    );
    expect(projectBilling.registerConnectorRunConsumption).toHaveBeenCalled();
  });

  it('does not mark a run successful when only import in-progress status is emitted', async () => {
    const {
      service,
      dataMartRunRepository,
      processSpawner,
      projectBilling,
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
    expect(projectBilling.registerConnectorRunConsumption).not.toHaveBeenCalled();
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
      projectBilling,
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
    expect(projectBilling.registerConnectorRunConsumption).not.toHaveBeenCalled();
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
    const { service, projectBilling, dataMartRunRepository } = createService();
    const { ProjectOperationBlockedException } =
      await import('../../../common/exceptions/project-operation-blocked.exception');
    (projectBilling.verifyCanPerformOperations as jest.Mock).mockRejectedValue(
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

  /**
   * Drives the WHOLE resume path rather than handing the executor a resume flag: the
   * recovery sweep flips INTERRUPTED -> PENDING and the trigger handler's claim flips
   * PENDING -> RUNNING, so by the time `executeInBackground` reads the row, INTERRUPTED
   * is two transitions in the past and no status check can recognise a resume.
   *
   * That matters because the incremental flusher REPLACES logs/errors with a snapshot of
   * the current attempt's buffers. Left enabled on a resumed attempt it overwrites the
   * earlier attempt's persisted output one interval in, and the terminal merge — which
   * reads the row it just clobbered — then has nothing left to restore.
   */
  it('keeps the first attempt logs when the recovery sweep resumes an interrupted run', async () => {
    const {
      service,
      dataMartRunRepository,
      processSpawner,
      gracefulShutdownService,
      configService,
      emitMessage,
      emitSuccessMessage,
    } = createService();

    // One stateful row stands in for the DB across BOTH attempts: the wipe is only
    // observable when the flusher's write and the terminal merge hit the same row.
    const row: {
      status: DataMartRunStatus;
      logs: string[] | null;
      errors: string[] | null;
    } = { status: DataMartRunStatus.RUNNING, logs: null, errors: null };
    let onIntermediateFlush: () => void = () => undefined;

    (dataMartRunRepository.findOne as jest.Mock).mockImplementation(async () => ({ ...row }));
    (dataMartRunRepository.update as jest.Mock).mockImplementation(
      async (criteria: unknown, patch: Record<string, unknown>) => {
        const expected = (criteria as { status?: { _value?: DataMartRunStatus[] } })?.status
          ?._value;
        if (expected && !expected.includes(row.status)) {
          return { affected: 0 };
        }
        if (patch.status) row.status = patch.status as DataMartRunStatus;
        if (patch.logs !== undefined) row.logs = patch.logs as string[] | null;
        if (patch.errors !== undefined) row.errors = patch.errors as string[] | null;
        // A logs write carrying no status is the flusher's intermediate snapshot.
        if (patch.status === undefined && patch.logs) onIntermediateFlush();
        return { affected: 1 };
      }
    );

    const logMessage = (text: string) => ({
      type: ConnectorMessageType.LOG,
      at: '2026-08-01T00:00:00.000Z',
      message: text,
      toFormattedString: () => `[LOG] ${text}`,
    });

    // Attempt 1: the pod is told to stop mid-import, so the run persists what it got
    // through and is left INTERRUPTED for the sweep.
    (processSpawner.spawnConnector as jest.Mock).mockImplementationOnce(async () => {
      emitMessage(logMessage('first attempt: imported 2024-01-01'));
      (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(true);
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    expect(row.status).toBe(DataMartRunStatus.INTERRUPTED);
    expect(row.logs!.join()).toContain('first attempt');

    // The REAL sweep: INTERRUPTED -> PENDING, exactly as it runs on the next boot.
    const sweepRepository = {
      find: jest.fn(async ({ where }: { where: { status: DataMartRunStatus; type: string } }) =>
        where.status === row.status && where.type === DataMartRunType.CONNECTOR
          ? [
              {
                id: 'run-1',
                dataMartId: 'dm-1',
                type: DataMartRunType.CONNECTOR,
                status: row.status,
                dataMart: { projectId: 'proj-1' },
                createdById: 'user-1',
                runType: 'MANUAL',
                additionalParams: null,
              },
            ]
          : []
      ),
      update: jest.fn(
        async (criteria: { status: DataMartRunStatus }, patch: { status: DataMartRunStatus }) => {
          if (criteria.status !== row.status) return { affected: 0 };
          row.status = patch.status;
          return { affected: 1 };
        }
      ),
    } as unknown as Repository<DataMartRun>;
    const connectorRunTriggerService = {
      createTrigger: jest.fn().mockResolvedValue('trigger-1'),
    } as unknown as ConnectorRunTriggerService;

    await new ConnectorRunService(
      sweepRepository,
      connectorRunTriggerService,
      service
    ).executeInterruptedRuns();

    expect(row.status).toBe(DataMartRunStatus.PENDING);

    // ...and then the trigger handler's claimRunSlotAtomically: PENDING -> RUNNING
    // followed by a full reload, which is the entity the executor is handed.
    row.status = DataMartRunStatus.RUNNING;
    const resumedRun = createRun({
      status: row.status,
      startedAt: new Date('2026-08-01T00:00:00.000Z'),
      logs: row.logs,
      errors: row.errors,
    });

    // Attempt 2 flushes almost immediately instead of after the 2s default, so it
    // really does write over the row while the run is still going.
    (configService.get as jest.Mock).mockImplementation((key: string, def: unknown) =>
      key === 'CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS' ? 1 : def
    );
    (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(false);

    // Hold the connector open until an intermediate write has actually landed (or the
    // resumed attempt proved it makes none), so the outcome is not a race.
    const flushSettled = new Promise<void>(resolve => {
      onIntermediateFlush = resolve;
      setTimeout(resolve, 50);
    });
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitMessage(logMessage('second attempt: imported 2024-01-02'));
      await flushSettled;
      emitSuccessMessage();
    });

    await service.executeInBackground(createDataMart(), resumedRun, null);

    expect(row.status).toBe(DataMartRunStatus.SUCCESS);
    const persistedLogs = row.logs!.join();
    expect(persistedLogs).toContain('first attempt: imported 2024-01-01');
    expect(persistedLogs).toContain('second attempt: imported 2024-01-02');
    // Preserved once, not duplicated by the merge.
    expect(row.logs!.filter(entry => entry.includes('first attempt'))).toHaveLength(1);
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

  it('persists a connector warning without a second generic error entry', async () => {
    const { service, dataMartRunRepository, processSpawner, emitMessage } = createService();
    // A failing connector emits both: the bare status flag, then the classified cause.
    // Only the cause belongs in errors — the flag carries no detail, and storing it too
    // renders a generic ERROR row beside a run whose only real failure is a warning.
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitMessage({
        type: ConnectorMessageType.STATUS,
        status: 5,
        at: new Date().toISOString(),
        toFormattedString: () => 'STATUS: ERROR',
      });
      emitMessage({
        type: ConnectorMessageType.WARNING,
        at: new Date().toISOString(),
        warning: 'Session has expired',
        toFormattedString: () => '[WARNING] Session has expired',
      });
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.FAILED
    );

    const errors = finalUpdate![1].errors as string[];
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Session has expired');
    // The warning counts as the terminal failure, so the fallback must stay quiet
    expect(errors.join()).not.toContain('finished without terminal success status');
  });

  // The fallback fires whenever the process resolves with no terminal success status and
  // no captured error. Only a shutdown makes that resumable, so severity splits on it.
  const findFallbackEntry = (dataMartRunRepository: Repository<DataMartRun>, status: string) => {
    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === status
    );
    const entry = (finalUpdate![1].errors as string[])
      .map(raw => JSON.parse(raw))
      .find(parsed => `${parsed.warning ?? parsed.error}`.includes('without terminal success'));

    expect(entry).toBeDefined();
    return entry;
  };

  it('still reports a failure when the connector sends a status flag and no detail', async () => {
    // status 5 is the connector explicitly reporting failure on a healthy backend: the run
    // ends FAILED and is never swept, so this must stay an error rather than a warning.
    const { service, dataMartRunRepository, processSpawner, emitMessage } = createService();
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      emitMessage({
        type: ConnectorMessageType.STATUS,
        status: 5,
        at: new Date().toISOString(),
        toFormattedString: () => 'STATUS: ERROR',
      });
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    const fallback = findFallbackEntry(dataMartRunRepository, DataMartRunStatus.FAILED);
    expect(fallback.type).toBe(ConnectorMessageType.ERROR);
    expect(fallback.error).toBe('Connector process finished without terminal success status');
    expect(fallback.warning).toBeUndefined();
  });

  it('keeps a silent exit an error when the backend is healthy', async () => {
    // A connector that exits 0 without ever emitting IMPORT_DONE is a bug, not a blip —
    // downgrading it would let a runner regression fail every run with no error signal.
    const { service, dataMartRunRepository, processSpawner } = createService();
    (processSpawner.spawnConnector as jest.Mock).mockResolvedValue(undefined);

    await service.executeInBackground(createDataMart(), createRun(), null);

    const fallback = findFallbackEntry(dataMartRunRepository, DataMartRunStatus.FAILED);
    expect(fallback.type).toBe(ConnectorMessageType.ERROR);
  });

  it('records a shutdown-interrupted run as a warning, not an error', async () => {
    // The run is marked INTERRUPTED and the retry sweep resumes it, continuing from its
    // last completed date, so a single such attempt is not individually actionable.
    const { service, dataMartRunRepository, processSpawner, gracefulShutdownService } =
      createService();
    (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
      // The process is killed mid-run; the spawner resolves quietly during shutdown.
      (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(true);
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    const fallback = findFallbackEntry(dataMartRunRepository, DataMartRunStatus.INTERRUPTED);
    expect(fallback.type).toBe(ConnectorMessageType.WARNING);
    expect(fallback.warning).toBe('Connector process finished without terminal success status');
    expect(fallback.error).toBeUndefined();
  });

  it('persists a cancelled configuration as a warning, not an error', async () => {
    const { service, dataMartRunRepository, processSpawner } = createService();
    const controller = new AbortController();
    controller.abort();
    (processSpawner.spawnConnector as jest.Mock).mockRejectedValue(
      new Error('Connector process was aborted')
    );

    await service.executeInBackground(createDataMart(), createRun(), null, controller.signal);

    const persisted = (dataMartRunRepository.update as jest.Mock).mock.calls
      .map(call => call[1]?.errors as string[] | undefined)
      .filter((errors): errors is string[] => Array.isArray(errors) && errors.length > 0)
      .pop();

    expect(persisted![0]).toContain(ConnectorMessageType.WARNING);
    expect(persisted![0]).not.toContain(`"type":"${ConnectorMessageType.ERROR}"`);
  });

  it('persists expired storage credentials as a warning, not an error', async () => {
    const { service, dataMartRunRepository, storageConfigService } = createService();
    (storageConfigService.buildStorageConfig as jest.Mock).mockRejectedValue(
      new CredentialsExpiredException('storage-1', 'storage')
    );

    await service.executeInBackground(createDataMart(), createRun(), null);

    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.FAILED
    );

    const errors = finalUpdate![1].errors as string[];
    expect(errors[0]).toContain(ConnectorMessageType.WARNING);
    expect(errors.join()).toContain('Reconnect this Storage');
  });

  it('records a configuration missing its _id as a run error', async () => {
    // Skipping it silently left no configuration result at all, so the run persisted as
    // FAILED with errors = null — invisible in run history and in the failure email.
    const { service, dataMartRunRepository } = createService();
    const dataMart = createDataMart({
      definition: {
        connector: {
          source: {
            name: 'TestConnector',
            node: 'test_node',
            fields: ['field1'],
            configuration: [{ param: 'val' }],
          },
          storage: { fullyQualifiedName: 'dataset.table' },
        },
      },
    });

    await service.executeInBackground(dataMart, createRun(), null);

    const finalUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls.find(
      call => call[1]?.status === DataMartRunStatus.FAILED
    );

    expect(finalUpdate![1].errors).not.toBeNull();
    expect((finalUpdate![1].errors as string[]).join()).toContain('missing _id');
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
      projectBilling,
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
    expect(projectBilling.registerConnectorRunConsumption).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dm-1' }),
      'run-1'
    );
    expect(eventDispatcher.publishExternal).toHaveBeenCalled();
  });

  describe('multi-configuration run outcome', () => {
    // A run executes one configuration per account. The run is SUCCESS only when
    // EVERY configuration succeeded: a partially imported run is not a completed
    // import, and reporting it green hides the accounts that never landed.
    const createMultiConfigDataMart = (): DataMart =>
      createDataMart({
        definition: {
          connector: {
            source: {
              name: 'TestConnector',
              node: 'test_node',
              fields: ['field1'],
              configuration: [
                { _id: 'cfg-1', param: 'account-1' },
                { _id: 'cfg-2', param: 'account-2' },
              ],
            },
            storage: { fullyQualifiedName: 'dataset.table' },
          },
        },
      });

    // The terminal write can be followed by a logs-only update, so read the last
    // call that actually carried a status rather than the last call outright.
    const lastPersistedStatus = (
      dataMartRunRepository: Repository<DataMartRun>
    ): DataMartRunStatus | undefined =>
      (dataMartRunRepository.update as jest.Mock).mock.calls
        .map(call => call[1]?.status as DataMartRunStatus | undefined)
        .filter((status): status is DataMartRunStatus => status !== undefined)
        .pop();

    it('marks a run FAILED when one configuration succeeds and another fails', async () => {
      const {
        service,
        dataMartRunRepository,
        processSpawner,
        projectBilling,
        eventDispatcher,
        emitSuccessMessage,
        emitErrorMessage,
      } = createService();
      let spawnCount = 0;
      (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
        spawnCount += 1;
        if (spawnCount === 1) {
          emitSuccessMessage();
        } else {
          emitErrorMessage();
        }
      });

      await service.executeInBackground(createMultiConfigDataMart(), createRun(), null);

      expect(lastPersistedStatus(dataMartRunRepository)).toBe(DataMartRunStatus.FAILED);
      // Status and billing part company here on purpose. The run is FAILED because one
      // configuration did not import, but the other one DID put rows in the warehouse and
      // that is what consumption measures. Gating billing on the all-success flag made a
      // connector with one permanently broken account free forever.
      expect(projectBilling.registerConnectorRunConsumption).toHaveBeenCalled();
      expect(eventDispatcher.publishExternal).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ status: 'unsuccessfully' }),
        })
      );
    });

    it('marks a run INTERRUPTED when shutdown cuts it off after a successful configuration', async () => {
      // The damaging case: one account imported before the pod was told to stop.
      // Reporting SUCCESS strands every remaining account — the run leaves the
      // sweep's reach and those accounts are silently never imported.
      const {
        service,
        dataMartRunRepository,
        processSpawner,
        gracefulShutdownService,
        projectBilling,
        eventDispatcher,
        emitSuccessMessage,
      } = createService();
      let spawnCount = 0;
      (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
        spawnCount += 1;
        if (spawnCount === 1) {
          emitSuccessMessage();
          return;
        }
        // Shutdown begins; the second configuration's process is killed and the
        // spawner resolves quietly without a terminal status.
        (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(true);
      });

      await service.executeInBackground(createMultiConfigDataMart(), createRun(), null);

      expect(lastPersistedStatus(dataMartRunRepository)).toBe(DataMartRunStatus.INTERRUPTED);
      // The one partially-successful state that must NOT be billed, and the reason billing
      // keys off the persisted status rather than just "some configuration succeeded": the
      // sweep resumes this run and the resumed attempt registers consumption itself, so
      // charging here would bill one import twice.
      expect(projectBilling.registerConnectorRunConsumption).not.toHaveBeenCalled();
      // An interrupted run is going to be resumed, so no outcome webhook may fire.
      expect(eventDispatcher.publishExternal).not.toHaveBeenCalled();
    });

    it('leaves a shutdown-interrupted partially successful run eligible for the recovery sweep', async () => {
      const {
        service,
        dataMartRunRepository,
        processSpawner,
        gracefulShutdownService,
        emitSuccessMessage,
      } = createService();
      const state = {
        current: DataMartRunStatus.RUNNING,
        statusHistory: [] as DataMartRunStatus[],
      };
      stubConditionalUpdate(dataMartRunRepository, state);
      let spawnCount = 0;
      (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
        spawnCount += 1;
        if (spawnCount === 1) {
          emitSuccessMessage();
          return;
        }
        (gracefulShutdownService.isInShutdownMode as jest.Mock).mockReturnValue(true);
      });

      await service.executeInBackground(createMultiConfigDataMart(), createRun(), null);

      // Now hand the row the executor actually left behind to the real recovery
      // sweep. Eligibility is not asserted against a constant: the repository
      // stub answers the sweep's own query, so the row comes back only if the
      // executor persisted the status the sweep looks for.
      const interruptedRow = {
        id: 'run-1',
        dataMartId: 'dm-1',
        type: DataMartRunType.CONNECTOR,
        status: state.current,
        dataMart: { projectId: 'proj-1' },
        createdById: 'user-1',
        runType: 'MANUAL',
        additionalParams: null,
      };
      const sweepRepository = {
        find: jest.fn(async ({ where }: { where: { status: DataMartRunStatus; type: string } }) =>
          where.status === interruptedRow.status && where.type === interruptedRow.type
            ? [interruptedRow]
            : []
        ),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      } as unknown as Repository<DataMartRun>;
      const connectorRunTriggerService = {
        createTrigger: jest.fn().mockResolvedValue('trigger-1'),
      } as unknown as ConnectorRunTriggerService;
      const runService = new ConnectorRunService(
        sweepRepository,
        connectorRunTriggerService,
        service
      );

      await runService.executeInterruptedRuns();

      expect(sweepRepository.update).toHaveBeenCalledWith(
        { id: 'run-1', status: DataMartRunStatus.INTERRUPTED },
        { status: DataMartRunStatus.PENDING }
      );
      expect(connectorRunTriggerService.createTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ dataMartRunId: 'run-1' })
      );
    });

    it('marks a run CANCELLED when the user cancels after one configuration succeeded', async () => {
      // The user stopped the run and it did not finish its work — CANCELLED says
      // that, and keeps a deliberate stop out of the failure notifications.
      const {
        service,
        dataMartRunRepository,
        processSpawner,
        projectBilling,
        eventDispatcher,
        emitSuccessMessage,
      } = createService();
      const controller = new AbortController();
      let spawnCount = 0;
      (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
        spawnCount += 1;
        if (spawnCount === 1) {
          emitSuccessMessage();
          controller.abort();
          return;
        }
        throw new Error('Connector process was aborted');
      });

      await service.executeInBackground(
        createMultiConfigDataMart(),
        createRun(),
        null,
        controller.signal
      );

      expect(lastPersistedStatus(dataMartRunRepository)).toBe(DataMartRunStatus.CANCELLED);
      // Billed, unlike the INTERRUPTED case below: a cancelled run is terminal and is never
      // resumed, so this is the only attempt those rows will ever be charged for. The
      // configuration that finished before the cancel landed did deliver its data.
      expect(projectBilling.registerConnectorRunConsumption).toHaveBeenCalled();
      expect(eventDispatcher.publishExternal).not.toHaveBeenCalled();
    });

    it('does not report SUCCESS for a run that executed no configurations', async () => {
      // Guards the vacuous case: "every configuration succeeded" must not be
      // satisfied by there being none. The definition schema requires at least
      // one configuration, so this only bites on unvalidated/legacy rows.
      const { service, dataMartRunRepository, processSpawner } = createService();
      const dataMart = createDataMart({
        definition: {
          connector: {
            source: {
              name: 'TestConnector',
              node: 'test_node',
              fields: ['field1'],
              configuration: [],
            },
            storage: { fullyQualifiedName: 'dataset.table' },
          },
        },
      });

      await service.executeInBackground(dataMart, createRun(), null);

      expect(processSpawner.spawnConnector).not.toHaveBeenCalled();
      expect(lastPersistedStatus(dataMartRunRepository)).toBe(DataMartRunStatus.FAILED);
    });
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

  /**
   * The guarded write can legitimately match nothing — another run rotated the same
   * credential first — and when it does, the token this run generated is gone while the
   * one it was refreshed from has already been invalidated upstream. The import itself
   * succeeded, so this is not a run failure; it is the reason the NEXT run will fail to
   * authenticate, and run history is where someone looks for that.
   */
  it('records a warning when a rotated credential could not be persisted, without failing the run', async () => {
    const {
      service,
      processSpawner,
      connectorSourceCredentialsService,
      dataMartRunRepository,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();
    getFirstSourceConfig(dataMart)._secrets_id = 'cred-1';

    (connectorSourceCredentialsService.updateCredentialFields as jest.Mock).mockResolvedValue({
      credentials: { id: 'cred-1' },
      updated: false,
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

    const finalRunUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls
      .map(call => call[1])
      .find(update => update.status !== undefined && update.status !== DataMartRunStatus.RUNNING);

    // The data landed, so the run is a success — the credential is next run's problem.
    expect(finalRunUpdate.status).toBe(DataMartRunStatus.SUCCESS);
    expect((finalRunUpdate.logs as string[]).join('\n')).toMatch(/could not be saved/i);
    expect(finalRunUpdate.errors).toBeNull();
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

  it('warns when a rotated credential cannot be persisted because the config has no credential reference', async () => {
    const { service, connectorSourceCredentialsService } = createService();
    const dataMart = createDataMart();
    const configWithoutCredentialReference = getFirstSourceConfig(dataMart);
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await service['saveConnectorCredentials'](
      configWithoutCredentialReference,
      { generated_refresh_token: 'rt-new' },
      undefined,
      dataMart,
      'run-1',
      'config-1'
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('has no stored credential'),
      expect.objectContaining({ configId: 'config-1' })
    );
    expect(connectorSourceCredentialsService.updateCredentialFields).not.toHaveBeenCalled();
    warnSpy.mockRestore();
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

  it('forwards manifest with logo stripped for a custom connector', async () => {
    const { service, processSpawner, connectorDefinitionService } = createService();
    (connectorDefinitionService.tryResolveManifest as jest.Mock).mockResolvedValue({
      name: 'CustomConnector',
      logo: 'data:image/png;base64,abc123',
      streams: [],
    });

    await service.executeInBackground(createDataMart(), createRun(), null);

    const seventhArg = (processSpawner.spawnConnector as jest.Mock).mock.calls[0][6];
    expect(seventhArg).toBeDefined();
    expect(seventhArg).toHaveProperty('name', 'CustomConnector');
    expect(seventhArg).not.toHaveProperty('logo');
    expect(seventhArg).toHaveProperty('streams');
  });

  it('forwards null manifest for a bundled connector', async () => {
    const { service, processSpawner, connectorDefinitionService } = createService();
    (connectorDefinitionService.tryResolveManifest as jest.Mock).mockResolvedValue(null);

    await service.executeInBackground(createDataMart(), createRun(), null);

    const seventhArg = (processSpawner.spawnConnector as jest.Mock).mock.calls[0][6];
    expect(seventhArg).toBeNull();
  });

  it('persists REQUESTED_DATE messages to run logs and still updates connector state', async () => {
    const {
      service,
      processSpawner,
      connectorStateService,
      dataMartRunRepository,
      emitMessage,
      emitSuccessMessage,
    } = createService();
    const dataMart = createDataMart();

    (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
      emitMessage({
        type: ConnectorMessageType.REQUESTED_DATE,
        at: '2026-05-02T12:00:00.000Z',
        date: '2026-05-01',
        toFormattedString: () => '[REQUESTED_DATE] 2026-05-01',
      });
      emitSuccessMessage();
      return Promise.resolve();
    });

    await service.executeInBackground(dataMart, createRun(), null);

    expect(connectorStateService.updateState).toHaveBeenCalledWith('dm-1', 'cfg-1', {
      state: { date: '2026-05-01' },
      at: '2026-05-02T12:00:00.000Z',
    });

    const finalRunUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls
      .map(call => call[1])
      .find(update => update.status === DataMartRunStatus.SUCCESS);

    expect(finalRunUpdate).toBeDefined();
    const persistedLogs = (finalRunUpdate.logs as string[]).map(entry => JSON.parse(entry));
    expect(persistedLogs).toContainEqual(
      expect.objectContaining({
        type: ConnectorMessageType.REQUESTED_DATE,
        date: '2026-05-01',
        at: '2026-05-02T12:00:00.000Z',
      })
    );
  });

  /**
   * `addMessageToArray` has always taken a `maxCount`, and not one call site passed one,
   * so a run's four message buffers grew for the whole of its lifetime. The bound that
   * matters is not memory: the flusher turns each buffered message into repeated writes
   * of the whole JSON column, so an unbounded buffer is an unbounded per-write cost.
   *
   * The cap is the merged-output cap, because that is the number of entries that can
   * actually reach the database — `capMergedEntries` discards everything past it at the
   * terminal write, so buffering more than that was always waste.
   */
  it('caps a run-scoped message buffer instead of letting a runaway connector grow it without bound', async () => {
    const { service, processSpawner, emitMessage, emitSuccessMessage, dataMartRunRepository } =
      createService();
    // The per-message logger call is the expensive part of emitting this many, and it is
    // not what is under test.
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    try {
      (processSpawner.spawnConnector as jest.Mock).mockImplementation(() => {
        for (let i = 0; i < MAX_MERGED_RUN_OUTPUT_ENTRIES + 5; i++) {
          emitMessage({
            type: ConnectorMessageType.LOG,
            at: '2026-05-02T12:00:00.000Z',
            message: `line ${i}`,
            toFormattedString: () => `[LOG] line ${i}`,
          });
        }
        emitSuccessMessage();
        return Promise.resolve();
      });

      await service.executeInBackground(createDataMart(), createRun(), null);

      const finalRunUpdate = (dataMartRunRepository.update as jest.Mock).mock.calls
        .map(call => call[1])
        .find(update => update.status === DataMartRunStatus.SUCCESS);
      const persistedLogs = finalRunUpdate.logs as string[];

      // The buffer bound and the merged bound have to compose exactly: the buffer's
      // "cap reached" entry is the last one that fits, so the terminal write has nothing
      // left to trim and must not claim a previous attempt was truncated.
      expect(persistedLogs).toHaveLength(MAX_MERGED_RUN_OUTPUT_ENTRIES);
      expect(persistedLogs[persistedLogs.length - 1]).toContain('Maximum number of messages');
      expect(persistedLogs[0]).not.toContain('earlier entries from previous attempts');
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  }, 30000);

  describe('createRunLogFlusher', () => {
    // Unit-level companion to the sweep-driven resume test above: that one proves the
    // flag is computed correctly from the real status churn, this one proves the flag
    // still disables streaming.
    it('returns null for a run that already carries an earlier attempt output', () => {
      const { service } = createService();

      const flusher = service['createRunLogFlusher']('run-1', [], [], true);
      expect(flusher).toBeNull();
    });

    it('returns a flusher whose write persists the serialized snapshot for a fresh run', async () => {
      const { service, dataMartRunRepository } = createService();
      const liveLogs: ConnectorMessage[] = [];
      const liveErrors: ConnectorMessage[] = [];
      const flusher = service['createRunLogFlusher']('run-1', liveLogs, liveErrors, false);
      expect(flusher).not.toBeNull();

      liveLogs.push({
        type: ConnectorMessageType.LOG,
        at: '2026-05-02T12:00:00.000Z',
        message: 'hello',
        toFormattedString: () => '[LOG] hello',
      } as unknown as ConnectorMessage);

      await flusher!.flushIfDirty();

      expect(dataMartRunRepository.update).toHaveBeenCalledWith('run-1', {
        logs: [JSON.stringify(liveLogs[0])],
        errors: null,
      });
    });

    /**
     * The snapshot used to be `liveLogs.map(JSON.stringify)`: every flush re-serialized
     * every message the run had produced so far, so a run emitting n messages paid
     * O(n^2) serialization for the same bytes. Only the entries added since the last
     * snapshot are new; the rest were serialized on an earlier tick and cannot have
     * changed, because a buffered message is never mutated after it is pushed.
     */
    it('serializes each message once across successive flushes, not the whole buffer every time', async () => {
      const { service } = createService();
      const liveLogs: ConnectorMessage[] = [];
      const flusher = service['createRunLogFlusher']('run-1', liveLogs, [], false)!;

      // A getter is read exactly once per JSON.stringify of its message, which makes
      // "how many times was this message serialized" directly observable.
      let reads = 0;
      const countingMessage = (index: number): ConnectorMessage => {
        const message = {
          type: ConnectorMessageType.LOG,
          at: '2026-05-02T12:00:00.000Z',
          toFormattedString: () => `[LOG] line ${index}`,
        } as unknown as ConnectorMessage;
        Object.defineProperty(message, 'message', {
          enumerable: true,
          get: () => {
            reads += 1;
            return `line ${index}`;
          },
        });
        return message;
      };

      for (let i = 0; i < 4; i++) {
        liveLogs.push(countingMessage(i));
        await flusher.flushIfDirty();
      }

      // Four messages, four serializations — not 1 + 2 + 3 + 4.
      expect(reads).toBe(4);
    });

    /**
     * Load-bearing for the terminal de-duplication: `persistedSnapshot()` is subtracted
     * from the persisted baseline on the assumption that it describes exactly what this
     * flusher WROTE. A snapshot that aliased the growing buffer would instead describe
     * the run's final state, and the terminal write would then strip entries that were
     * never flushed — losing them outright, which `discountFlushedEntries` is explicitly
     * written to avoid.
     */
    it('hands every flush its own snapshot array, so persistedSnapshot() cannot drift with the buffer', async () => {
      const { service, dataMartRunRepository } = createService();
      const liveLogs: ConnectorMessage[] = [];
      const flusher = service['createRunLogFlusher']('run-1', liveLogs, [], false)!;
      const message = (text: string): ConnectorMessage =>
        ({
          type: ConnectorMessageType.LOG,
          at: '2026-05-02T12:00:00.000Z',
          message: text,
          toFormattedString: () => `[LOG] ${text}`,
        }) as unknown as ConnectorMessage;

      liveLogs.push(message('first'));
      await flusher.flushIfDirty();
      const firstWrite = (dataMartRunRepository.update as jest.Mock).mock.calls[0][1] as {
        logs: string[];
      };

      liveLogs.push(message('second'));
      await flusher.flushIfDirty();

      expect(firstWrite.logs).toHaveLength(1);
      expect(flusher.persistedSnapshot()?.logs).toHaveLength(2);
    });

    /**
     * The flusher and the terminal write describe the SAME execution: the flusher
     * replaces the row's logs with a live snapshot as the run goes, and
     * `updateRunStatus` then concatenates its own captured output onto whatever is
     * persisted — which by then is that snapshot. Every message the flusher managed to
     * write therefore lands a second time, doubling run history, halving the effective
     * 6 MiB output budget, and repeating each error in the failure notification.
     *
     * A stateful repository double is what makes this observable: with `findOne`
     * hard-wired to null the two writes never meet.
     */
    it('does not persist a message the flusher already wrote a second time', async () => {
      const { service, dataMartRunRepository, processSpawner, configService, emitSuccessMessage } =
        createService();

      const row: { logs: string[] | null; errors: string[] | null } = { logs: null, errors: null };
      (dataMartRunRepository.findOne as jest.Mock).mockImplementation(async () => ({ ...row }));

      let resolveFlushed: () => void = () => undefined;
      const flushed = new Promise<void>(resolve => {
        resolveFlushed = resolve;
      });
      (dataMartRunRepository.update as jest.Mock).mockImplementation(
        async (_criteria: unknown, patch: Record<string, unknown>) => {
          if (patch.logs !== undefined) row.logs = patch.logs as string[] | null;
          if (patch.errors !== undefined) row.errors = patch.errors as string[] | null;
          // A logs write with no status is the flusher's intermediate snapshot.
          if (patch.status === undefined && patch.logs) resolveFlushed();
          return { affected: 1 };
        }
      );

      // Flush almost immediately instead of after the 2s default, so the run really
      // does have an intermediate write for the terminal one to collide with.
      (configService.get as jest.Mock).mockImplementation((key: string, def: unknown) =>
        key === 'CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS' ? 1 : def
      );

      // Hold the connector open until the flusher has actually persisted a snapshot,
      // so the collision is deterministic rather than a race against the interval.
      (processSpawner.spawnConnector as jest.Mock).mockImplementation(async () => {
        emitSuccessMessage();
        await flushed;
      });

      await service.executeInBackground(createDataMart(), createRun(), null);

      // Exactly one message was emitted by the run, so exactly one entry may be stored.
      expect(row.logs).toEqual([expect.stringContaining('"status":3')]);
      expect(row.errors).toBeNull();
    });
  });
});
