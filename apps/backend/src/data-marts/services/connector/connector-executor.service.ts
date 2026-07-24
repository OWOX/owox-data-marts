import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { ConfigDto, GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD } = Core;
type ConfigDto = InstanceType<typeof Core.ConfigDto>;
const GENERATED_REFRESH_TOKEN_MAX_LENGTH = 4096;

/**
 * Bounds on logs/errors carried across resumed attempts of the same run.
 *
 * The entry cap comfortably holds a full long-backfill attempt (a ~315k-record
 * run produced roughly 7.4k entries). The byte budget is the binding limit for
 * verbose entries: logs and errors travel in ONE UPDATE statement, so the worst
 * case on the wire is 2 x MAX_MERGED_RUN_OUTPUT_BYTES plus JSON overhead —
 * kept safely under the smallest common MySQL max_allowed_packet (16MB).
 * Entry sizes are measured on the JSON-serialized form so quote escaping and
 * multibyte characters count toward the real packet size.
 */
const MAX_MERGED_RUN_OUTPUT_ENTRIES = 10000;
const MAX_MERGED_RUN_OUTPUT_BYTES = 6 * 1024 * 1024;

import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorOutputCaptureService } from '../../connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import { ConnectorStateService } from '../../connector-types/connector-message/services/connector-state.service';
import { ConsumptionTrackingService } from '../consumption-tracking.service';
import { DataMartService } from '../data-mart.service';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { ConnectorExecutionError } from '../../errors/connector-execution.error';
import { OwoxEventDispatcher } from '../../../common/event-dispatcher/owox-event-dispatcher';
import { ConnectorRunEvent } from '../../events/connector-run.event';
import { ProjectBalanceService } from '../project-balance.service';
import { ConnectorProcessSpawnerService } from './connector-process-spawner.service';
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { ConnectorSourceConfigService } from './connector-source-config.service';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { addMessageToArray } from './connector-message.utils';
import { NON_TERMINAL_DATA_MART_RUN_STATUSES } from '../../utils/data-mart-run-cancellation';

interface ConfigurationExecutionResult {
  configIndex: number;
  success: boolean;
  logs: ConnectorMessage[];
  errors: ConnectorMessage[];
}

@Injectable()
export class ConnectorExecutorService {
  private readonly logger = new Logger(ConnectorExecutorService.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly processSpawner: ConnectorProcessSpawnerService,
    private readonly storageConfigService: ConnectorStorageConfigService,
    private readonly sourceConfigService: ConnectorSourceConfigService,
    private readonly credentialInjector: ConnectorCredentialInjectorService,
    private readonly connectorOutputCaptureService: ConnectorOutputCaptureService,
    private readonly connectorStateService: ConnectorStateService,
    private readonly consumptionTracker: ConsumptionTrackingService,
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly systemTimeService: SystemTimeService,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly projectBalanceService: ProjectBalanceService,
    private readonly dataMartService: DataMartService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService
  ) {}

  async executeInBackground(
    dataMart: DataMart,
    run: DataMartRun,
    payload?: Record<string, unknown> | null,
    signal?: AbortSignal
  ): Promise<void> {
    const runId = run.id;
    const processId = `connector-run-${runId}`;

    this.gracefulShutdownService.registerActiveProcess(processId);

    const capturedLogs: ConnectorMessage[] = [];
    const capturedErrors: ConnectorMessage[] = [];
    let hasSuccessfulRun = false;
    let wasCancelled = false;
    let operationBlockedException: ProjectOperationBlockedException | undefined;

    try {
      if (this.gracefulShutdownService.isInShutdownMode()) {
        throw new ConnectorExecutionError(
          'Skipping connector execution. Application is shutting down.',
          undefined,
          { dataMartId: dataMart.id, projectId: dataMart.projectId, runId }
        );
      }

      await this.projectBalanceService.verifyCanPerformOperations(dataMart.projectId);

      // Guarded like the terminal write below: a cancel can land in the window
      // between claimRunSlotAtomically and here (e.g. during the awaited balance
      // check), and an unconditional write would flip the row back to RUNNING —
      // resurrecting a cancelled run. `startedAt` is set once, on the first
      // attempt, and preserved across resumes so Run History keeps the original
      // start time.
      const claimed = await this.dataMartRunRepository.update(
        { id: runId, status: In(NON_TERMINAL_DATA_MART_RUN_STATUSES) },
        {
          status: DataMartRunStatus.RUNNING,
          ...(run.startedAt != null ? {} : { startedAt: this.systemTimeService.now() }),
          finishedAt: null,
        }
      );

      if (!claimed.affected) {
        // The run reached a terminal status (a concurrent cancel) before
        // execution started — do not spawn the connector and do not publish
        // run-outcome events for it.
        wasCancelled = true;
        this.logger.log(
          `Skipping connector execution for run ${runId}: run reached a terminal status before execution started`,
          { dataMartId: dataMart.id, projectId: dataMart.projectId, runId }
        );
        return;
      }

      const configurationResults = await this.runConnectorConfigurations(
        runId,
        processId,
        dataMart,
        payload,
        signal
      );

      configurationResults.forEach(result => {
        result.logs.forEach(log => addMessageToArray(capturedLogs, log));
        result.errors.forEach(error => addMessageToArray(capturedErrors, error));
      });

      const successCount = configurationResults.filter(r => r.success).length;
      const totalCount = configurationResults.length;
      hasSuccessfulRun = successCount > 0;
      wasCancelled = signal?.aborted === true && !hasSuccessfulRun;
      this.logger.log(
        `Connector execution completed: ${successCount}/${totalCount} configurations successful`,
        { dataMartId: dataMart.id, projectId: dataMart.projectId, runId, successCount, totalCount }
      );
    } catch (error) {
      wasCancelled = signal?.aborted === true && !hasSuccessfulRun;
      const errorMessage = error instanceof Error ? error.message : String(error);
      addMessageToArray(capturedErrors, {
        type: ConnectorMessageType.ERROR,
        at: this.systemTimeService.now().toISOString(),
        error: errorMessage,
        toFormattedString: () => `[ERROR] ${errorMessage}`,
      });
      const errorContext = {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
        error: errorMessage,
      };
      if (error instanceof ProjectOperationBlockedException) {
        operationBlockedException = error;
        this.logger.warn(
          `Restrict running connector configurations: ${errorMessage}\n${JSON.stringify(errorContext)}`
        );
      } else {
        this.logger.error(
          `Error running connector configurations: ${errorMessage}`,
          (error as Error)?.stack,
          errorContext
        );
      }
    } finally {
      // When the terminal status write is skipped (the run was cancelled
      // concurrently and CANCELLED must win), billing and outcome events must
      // be skipped too: the persisted status is CANCELLED, and charging the
      // project or publishing a success/failure webhook would contradict it.
      const statusPersisted = await this.updateRunStatus(
        runId,
        hasSuccessfulRun,
        capturedLogs,
        capturedErrors,
        operationBlockedException,
        wasCancelled
      );

      if (hasSuccessfulRun && statusPersisted) {
        await this.consumptionTracker.registerConnectorRunConsumption(dataMart, runId);
        await this.eventDispatcher.publishExternal(
          new ConnectorRunEvent(
            dataMart.id,
            runId,
            dataMart.projectId,
            run.createdById ?? 'system',
            run.runType,
            'successfully'
          )
        );
      } else if (
        statusPersisted &&
        !wasCancelled &&
        !this.gracefulShutdownService.isInShutdownMode()
      ) {
        await this.eventDispatcher.publishExternal(
          new ConnectorRunEvent(
            dataMart.id,
            runId,
            dataMart.projectId,
            run.createdById ?? 'system',
            run.runType,
            'unsuccessfully'
          )
        );
      }

      this.logger.debug(`Actualizing schema after connector execution`, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
      });

      try {
        await this.dataMartService.actualizeSchema(dataMart.id, dataMart.projectId);
      } catch (error) {
        const schemaError = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error schema actualization: ${schemaError}`, (error as Error)?.stack, {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          error: schemaError,
        });
      }

      this.gracefulShutdownService.unregisterActiveProcess(processId);
    }
  }

  private async runConnectorConfigurations(
    runId: string,
    processId: string,
    dataMart: DataMart,
    payload?: Record<string, unknown> | null,
    signal?: AbortSignal
  ): Promise<ConfigurationExecutionResult[]> {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;
    const configurationResults: ConfigurationExecutionResult[] = [];

    for (const [configIndex, config] of connector.source.configuration.entries()) {
      const configId = (config as Record<string, unknown>)._id as string;

      if (!configId) {
        this.logger.error(
          `Configuration at index ${configIndex} is missing _id. Skipping this configuration.`,
          { dataMartId: dataMart.id, projectId: dataMart.projectId, runId, configIndex }
        );
        continue;
      }

      const configLogs: ConnectorMessage[] = [];
      const configErrors: ConnectorMessage[] = [];
      let success = false;
      let credentialUpdates: Record<string, unknown> | undefined;
      let configForCredentialUpdates = config as Record<string, unknown>;
      let expectedCredentialValues: Record<string, unknown> | undefined;

      const logCaptureConfig = this.connectorOutputCaptureService.createCapture(
        (message: ConnectorMessage) => {
          switch (message.type) {
            case ConnectorMessageType.ERROR:
              addMessageToArray(configErrors, message);
              this.logger.error(`${message.toFormattedString()}`, {
                dataMartId: dataMart.id,
                projectId: dataMart.projectId,
                runId,
                configId,
              });
              break;
            case ConnectorMessageType.REQUESTED_DATE:
              this.connectorStateService
                .updateState(dataMart.id, configId, {
                  state: { date: message.date },
                  at: message.at,
                })
                .catch(error => {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  this.logger.error(
                    `Failed to save state: ${errorMessage}`,
                    (error as Error)?.stack,
                    {
                      dataMartId: dataMart.id,
                      projectId: dataMart.projectId,
                      runId,
                      configId,
                      error: errorMessage,
                    }
                  );
                });
              break;
            case ConnectorMessageType.CREDENTIALS_UPDATE:
              credentialUpdates = { ...(credentialUpdates ?? {}), ...message.credentials };
              break;
            case ConnectorMessageType.STATUS:
              if (message.status === Core.EXECUTION_STATUS.ERROR) {
                success = false;
                addMessageToArray(configErrors, message);
                this.logger.error(`${message.toFormattedString()}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              } else if (this.isSuccessfulConnectorStatus(message.status)) {
                success = true;
                addMessageToArray(configLogs, message);
                this.logger.log(`${message.status}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              } else {
                addMessageToArray(configLogs, message);
                this.logger.log(`${message.status}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              }
              break;
            default:
              addMessageToArray(configLogs, message);
              this.logger.log(`${message.toFormattedString()}`, {
                dataMartId: dataMart.id,
                projectId: dataMart.projectId,
                runId,
                configId,
              });
              break;
          }
        },
        (pid: number) => {
          this.gracefulShutdownService.updateProcessPid(processId, pid);
        }
      );

      try {
        const refreshedConfig = await this.credentialInjector.refreshCredentialsForConfig(
          dataMart.projectId,
          connector.source.name,
          config as Record<string, unknown>
        );
        configForCredentialUpdates = refreshedConfig;
        expectedCredentialValues = await this.getExpectedCredentialValues(
          refreshedConfig,
          dataMart,
          runId,
          configId
        );

        const configState = await this.connectorStateService.getState(dataMart.id, configId);

        const configuration = new ConfigDto({
          name: connector.source.name,
          datamartId: dataMart.id,
          source: await this.sourceConfigService.buildSourceConfig(
            dataMart.id,
            dataMart.projectId,
            connector,
            refreshedConfig,
            configId,
            configState
          ),
          storage: await this.storageConfigService.buildStorageConfig(dataMart),
        });

        const runConfig = this.sourceConfigService.buildRunConfig(payload, configState);

        await this.processSpawner.spawnConnector(
          dataMart.id,
          runId,
          configuration,
          runConfig,
          logCaptureConfig,
          signal
        );

        if (success) {
          this.logger.log(`Configuration ${configIndex + 1} completed successfully`, {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
            configId,
            configIndex,
          });
        } else if (configErrors.length === 0) {
          const errorMessage = 'Connector process finished without terminal success status';
          addMessageToArray(configErrors, {
            type: ConnectorMessageType.ERROR,
            at: this.systemTimeService.now().toISOString(),
            error: errorMessage,
            toFormattedString: () => `[ERROR] ${errorMessage}`,
          });
          this.logger.error(`Configuration ${configIndex + 1} failed: ${errorMessage}`, {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
            configId,
            configIndex,
          });
        }
      } catch (error) {
        success = false;
        const errorMessage = error instanceof Error ? error.message : String(error);
        addMessageToArray(configErrors, {
          type: ConnectorMessageType.ERROR,
          at: this.systemTimeService.now().toISOString(),
          error: errorMessage,
          toFormattedString: () =>
            `[ERROR] Configuration ${configIndex + 1} failed: ${errorMessage}`,
        });
        this.logger.error(
          `Configuration ${configIndex + 1} failed: ${errorMessage}`,
          (error as Error)?.stack,
          {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
            configId,
            configIndex,
            error: errorMessage,
          }
        );
      } finally {
        if (credentialUpdates) {
          try {
            await this.saveConnectorCredentials(
              configForCredentialUpdates,
              credentialUpdates,
              expectedCredentialValues,
              dataMart,
              runId,
              configId
            );
          } catch (error) {
            success = false;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const credentialErrorMessage = `Failed to update connector credentials: ${errorMessage}`;
            addMessageToArray(configErrors, {
              type: ConnectorMessageType.ERROR,
              at: this.systemTimeService.now().toISOString(),
              error: credentialErrorMessage,
              toFormattedString: () => `[ERROR] ${credentialErrorMessage}`,
            });
          }
        }
        configurationResults.push({ configIndex, success, logs: configLogs, errors: configErrors });
      }
    }

    return configurationResults;
  }

  private async saveConnectorCredentials(
    config: Record<string, unknown>,
    credentials: Record<string, unknown>,
    expectedCredentialValues: Record<string, unknown> | undefined,
    dataMart: DataMart,
    runId: string,
    configId: string
  ): Promise<void> {
    try {
      const credentialUpdates = this.getAllowedCredentialUpdates(credentials);
      const droppedCredentialKeys = Object.keys(credentials).filter(
        key => !(key in credentialUpdates)
      );

      if (droppedCredentialKeys.length > 0) {
        this.logger.warn(`Dropped unsupported connector credential updates`, {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          configId,
          credentialKeys: droppedCredentialKeys,
        });
      }

      if (Object.keys(credentialUpdates).length === 0) {
        return;
      }

      const credentialId = this.getCredentialIdForConfig(config);
      if (!credentialId) {
        this.logger.debug(`Skipping connector credential update: no credential reference found`, {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          configId,
          credentialKeys: Object.keys(credentials),
        });
        return;
      }

      if (expectedCredentialValues) {
        await this.connectorSourceCredentialsService.updateCredentialFields(
          credentialId,
          dataMart.projectId,
          credentialUpdates,
          expectedCredentialValues
        );
      } else {
        await this.connectorSourceCredentialsService.updateCredentialFields(
          credentialId,
          dataMart.projectId,
          credentialUpdates
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to update connector credentials: ${errorMessage}`,
        (error as Error)?.stack,
        {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          configId,
          error: errorMessage,
          credentialKeys: Object.keys(credentials),
        }
      );
      throw error;
    }
  }

  private async getExpectedCredentialValues(
    config: Record<string, unknown>,
    dataMart: DataMart,
    runId: string,
    configId: string
  ): Promise<Record<string, unknown> | undefined> {
    const credentialId = this.getCredentialIdForConfig(config);
    if (!credentialId) {
      return undefined;
    }

    try {
      const credentials =
        await this.connectorSourceCredentialsService.getCredentialsById(credentialId);

      if (!credentials || credentials.projectId !== dataMart.projectId) {
        return undefined;
      }

      return {
        [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]:
          credentials.credentials?.[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to snapshot connector credentials before execution`, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
        configId,
        credentialId,
        error: errorMessage,
      });
      return undefined;
    }
  }

  private getAllowedCredentialUpdates(
    credentials: Record<string, unknown>
  ): Record<string, string> {
    const generatedRefreshToken = credentials[GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD];

    if (
      typeof generatedRefreshToken !== 'string' ||
      generatedRefreshToken.length === 0 ||
      generatedRefreshToken.length > GENERATED_REFRESH_TOKEN_MAX_LENGTH
    ) {
      return {};
    }

    return { [GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD]: generatedRefreshToken };
  }

  private getCredentialIdForConfig(config: Record<string, unknown>): string | undefined {
    const sourceCredentialId = this.findSourceCredentialId(config);
    if (sourceCredentialId) {
      return sourceCredentialId;
    }

    const secretsId = config._secrets_id;
    if (typeof secretsId === 'string' && secretsId) {
      return secretsId;
    }

    return undefined;
  }

  private findSourceCredentialId(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const credentialId = this.findSourceCredentialId(item);
        if (credentialId) {
          return credentialId;
        }
      }
      return undefined;
    }

    const obj = value as Record<string, unknown>;
    const credentialId = obj._source_credential_id;
    if (typeof credentialId === 'string' && credentialId) {
      return credentialId;
    }

    for (const item of Object.values(obj)) {
      const nestedCredentialId = this.findSourceCredentialId(item);
      if (nestedCredentialId) {
        return nestedCredentialId;
      }
    }

    return undefined;
  }

  private isSuccessfulConnectorStatus(status: number): boolean {
    return status === Core.EXECUTION_STATUS.IMPORT_DONE;
  }

  /**
   * Writes the run's terminal status, guarded so a concurrently committed
   * terminal status (a cancel) always wins.
   *
   * @returns true when the status write landed; false when it was skipped
   * because the run had already reached a terminal status — callers must not
   * bill consumption or publish run-outcome events in that case.
   */
  private async updateRunStatus(
    runId: string,
    hasSuccessfulRun: boolean,
    capturedLogs: ConnectorMessage[],
    capturedErrors: ConnectorMessage[],
    operationBlockedException?: ProjectOperationBlockedException,
    wasCancelled: boolean = false
  ): Promise<boolean> {
    let status = wasCancelled
      ? DataMartRunStatus.CANCELLED
      : hasSuccessfulRun
        ? DataMartRunStatus.SUCCESS
        : operationBlockedException
          ? DataMartRunStatus.RESTRICTED
          : DataMartRunStatus.FAILED;
    if (!wasCancelled && !hasSuccessfulRun && this.gracefulShutdownService.isInShutdownMode()) {
      status = DataMartRunStatus.INTERRUPTED;
    }

    const newLogStrings = capturedLogs.map(log => JSON.stringify(log));
    const newErrorStrings = capturedErrors.map(error => JSON.stringify(error));

    // Always merge onto what is already persisted rather than trying to detect
    // "is this a resume": for a first attempt the persisted arrays are empty so
    // merging is identity, and every resumed/interrupted attempt keeps its full
    // history — including runs interrupted before their first RUNNING write,
    // which no per-run flag can reliably identify.
    const { logs: logsToSave, errors: errorsToSave } = await this.mergeWithPersistedOutput(
      runId,
      newLogStrings,
      newErrorStrings
    );

    // Only claim the run if it has not already reached a terminal status: a
    // concurrent cancel must win over an orphaned execution that is still
    // finishing up, otherwise the cancelled run silently reverts to
    // SUCCESS/FAILED and the retry sweep can resurrect it.
    const result = await this.dataMartRunRepository.update(
      { id: runId, status: In(NON_TERMINAL_DATA_MART_RUN_STATUSES) },
      {
        status,
        finishedAt: this.systemTimeService.now(),
        logs: logsToSave,
        errors: errorsToSave,
      }
    );

    if (result.affected) {
      return true;
    }

    // Routine on every user cancellation (the cancel endpoint commits CANCELLED
    // before the abort reaches this execution), so log-level, not a warning.
    this.logger.log(
      `Skipped final status update for run ${runId}: run already reached a terminal status`
    );

    // The status write is correctly skipped, but the logs and errors this
    // execution captured are still the only record of what it did — persist
    // the already-merged output rather than discarding it.
    if (newLogStrings.length > 0 || newErrorStrings.length > 0) {
      await this.dataMartRunRepository.update(
        { id: runId },
        { logs: logsToSave, errors: errorsToSave }
      );
    }

    return false;
  }

  /**
   * Concatenates this execution's captured output onto whatever is already
   * persisted for the run, so a resumed or superseded attempt extends the log
   * trail instead of replacing it.
   */
  private async mergeWithPersistedOutput(
    runId: string,
    newLogStrings: string[],
    newErrorStrings: string[]
  ): Promise<{ logs: string[] | null; errors: string[] | null }> {
    const existing = await this.dataMartRunRepository.findOne({ where: { id: runId } });
    const existingLogs = (existing?.logs as string[] | null) ?? [];
    const existingErrors = (existing?.errors as string[] | null) ?? [];

    const mergedLogs = this.capMergedEntries([...existingLogs, ...newLogStrings]);
    const mergedErrors = this.capMergedEntries([...existingErrors, ...newErrorStrings]);

    return {
      logs: mergedLogs.length > 0 ? mergedLogs : null,
      errors: mergedErrors.length > 0 ? mergedErrors : null,
    };
  }

  /**
   * Bounds a merged log/error array by entry count AND serialized bytes so
   * repeatedly interrupted runs cannot grow their `json` column past MySQL's
   * max_allowed_packet — count alone is not enough, since entries can approach
   * 5000 characters each before escaping.
   *
   * Keeps the most recent entries: the tail describes where the run actually got
   * to, which is what someone debugging a resumed run needs. The truncation
   * notice counts toward the entry cap, so the result never exceeds
   * MAX_MERGED_RUN_OUTPUT_ENTRIES entries.
   */
  private capMergedEntries(entries: string[]): string[] {
    // Walk from the tail (newest first), measuring each entry as it will
    // actually be serialized — JSON.stringify accounts for quote escaping and
    // multibyte characters that raw .length would undercount.
    let keptBytes = 0;
    let keep = 0;
    while (keep < entries.length && keep < MAX_MERGED_RUN_OUTPUT_ENTRIES) {
      const entryBytes = Buffer.byteLength(JSON.stringify(entries[entries.length - 1 - keep])) + 1;
      if (keptBytes + entryBytes > MAX_MERGED_RUN_OUTPUT_BYTES) {
        break;
      }
      keptBytes += entryBytes;
      keep++;
    }

    if (keep === entries.length) {
      return entries;
    }

    // Leave room for the notice itself within the entry cap.
    keep = Math.min(keep, MAX_MERGED_RUN_OUTPUT_ENTRIES - 1);
    const dropped = entries.length - keep;
    const truncationNotice = JSON.stringify({
      type: ConnectorMessageType.LOG,
      at: this.systemTimeService.now().toISOString(),
      message: `... ${dropped} earlier entries from previous attempts were truncated`,
    });

    return [truncationNotice, ...entries.slice(entries.length - keep)];
  }
}
