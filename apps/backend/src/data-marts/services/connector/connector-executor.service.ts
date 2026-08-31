import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Core } from '@owox/connectors';
import { castError } from '@owox/internal-helpers';

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
 *
 * The entry cap also derives the bound on the in-memory buffers, so they stop where the
 * persisted array stops: `capMergedEntries` discards everything past it at the terminal
 * write, so a buffer that grew beyond it was accumulating entries that could never be
 * stored — and paying for them on every intermediate flush, which rewrites the whole
 * JSON column.
 */
export const MAX_MERGED_RUN_OUTPUT_ENTRIES = 10000;
const MAX_MERGED_RUN_OUTPUT_BYTES = 6 * 1024 * 1024;

/**
 * Bound on each in-memory message buffer of a single execution.
 *
 * One less than the merged cap because `addMessageToArray` spends an entry saying the
 * cap was reached, exactly as `capMergedEntries` reserves one for its own truncation
 * notice. At the merged cap the two would compose into cap + 1 entries, and the terminal
 * write would then trim that single entry and label a first attempt
 * "earlier entries from previous attempts were truncated" — reporting a resume that
 * never happened.
 */
const MAX_RUN_BUFFER_ENTRIES = MAX_MERGED_RUN_OUTPUT_ENTRIES - 1;

import { ConnectorDefinition as DataMartConnectorDefinition } from '../../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartRun } from '../../entities/data-mart-run.entity';
import { DataMartRunStatus } from '../../enums/data-mart-run-status.enum';
import { ProjectOperationBlockedException } from '../../../common/exceptions/project-operation-blocked.exception';
import { ConnectorMessage } from '../../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorOutputCaptureService } from '../../connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorMessageType } from '../../connector-types/enums/connector-message-type-enum';
import { ConnectorStateService } from '../../connector-types/connector-message/services/connector-state.service';
import { DataMartService } from '../data-mart.service';
import { GracefulShutdownService } from '../../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { ConnectorExecutionError } from '../../errors/connector-execution.error';
import { CredentialsExpiredException } from '../../exceptions/google-oauth.exceptions';
import { OwoxEventDispatcher } from '../../../common/event-dispatcher/owox-event-dispatcher';
import { ConnectorRunEvent } from '../../events/connector-run.event';
import { ProjectBillingService, RunKind } from '../project-billing/project-billing.service';
import { ConnectorDefinitionService } from './connector-definition.service';
import { ConnectorProcessSpawnerService } from './connector-process-spawner.service';
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { ConnectorSourceConfigService } from './connector-source-config.service';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { addMessageToArray } from './connector-message.utils';
import { NON_TERMINAL_DATA_MART_RUN_STATUSES } from '../../utils/data-mart-run-cancellation';
import { createRunLogSnapshotReader, RunLogFlusher, RunLogSnapshot } from './run-log-flusher';

/**
 * `addMessageToArray` with this file's entry bound always applied.
 *
 * Every run-scoped buffer goes through it rather than calling `addMessageToArray`
 * directly: the cap is optional in that helper, and when each of these call sites
 * decided for itself, all of them omitted it and every buffer grew for the lifetime of
 * the run. One function is also one place to grep to prove no unbounded buffer is left.
 */
function addBoundedMessage(array: ConnectorMessage[], message: ConnectorMessage): void {
  addMessageToArray(array, message, MAX_RUN_BUFFER_ENTRIES);
}

interface ConfigurationExecutionResult {
  configIndex: number;
  success: boolean;
  logs: ConnectorMessage[];
  errors: ConnectorMessage[];
  fieldsUpdate?: {
    fields: string[];
  };
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
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly systemTimeService: SystemTimeService,
    private readonly eventDispatcher: OwoxEventDispatcher,
    private readonly projectBillingService: ProjectBillingService,
    private readonly dataMartService: DataMartService,
    private readonly connectorDefinitionService: ConnectorDefinitionService,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly configService: ConfigService
  ) {}

  async executeInBackground(
    dataMart: DataMart,
    run: DataMartRun,
    payload?: Record<string, unknown> | null,
    signal?: AbortSignal
  ): Promise<void> {
    const runId = run.id;
    const processId = `connector-run-${runId}`;
    // Does an EARLIER attempt of this run already have output in the row? That decides
    // whether the incremental flusher may run, because its write REPLACES the column
    // (see createRunLogFlusher).
    //
    // Deliberately NOT `run.status === INTERRUPTED`: by the time a resumed attempt
    // reaches here that status is two transitions in the past — the recovery sweep flips
    // INTERRUPTED -> PENDING and claimRunSlotAtomically flips PENDING -> RUNNING, both
    // before this method reads the row — so the check never fired on a real resume, the
    // flusher stayed enabled, and it overwrote the previous attempt's logs one interval
    // in; the terminal merge then had nothing left to restore. The run entity arrives
    // freshly reloaded by that claim, so its logs/errors ARE the persisted output: the
    // one signal true for every resume, including a run interrupted before its first
    // RUNNING write, which neither status nor startedAt can identify.
    const hasOutputFromEarlierAttempt =
      (run.logs?.length ?? 0) > 0 || (run.errors?.length ?? 0) > 0;

    this.gracefulShutdownService.registerActiveProcess(processId);

    const capturedLogs: ConnectorMessage[] = [];
    const capturedErrors: ConnectorMessage[] = [];
    let configurationResults: ConfigurationExecutionResult[] = [];
    const liveLogs: ConnectorMessage[] = [];
    const liveErrors: ConnectorMessage[] = [];
    let logFlusher: RunLogFlusher | null = null;
    let allConfigurationsSucceeded = false;
    let hasAnySuccessfulConfiguration = false;
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

      await this.projectBillingService.verifyCanPerformOperations(
        dataMart.projectId,
        RunKind.CONNECTOR_RUN
      );

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

      logFlusher = this.createRunLogFlusher(
        runId,
        liveLogs,
        liveErrors,
        hasOutputFromEarlierAttempt
      );
      logFlusher?.start();

      configurationResults = await this.runConnectorConfigurations(
        runId,
        processId,
        dataMart,
        payload,
        signal,
        liveLogs,
        liveErrors
      );

      configurationResults.forEach(result => {
        result.logs.forEach(log => addBoundedMessage(capturedLogs, log));
        result.errors.forEach(error => addBoundedMessage(capturedErrors, error));
      });

      const successCount = configurationResults.filter(r => r.success).length;
      const totalCount = configurationResults.length;
      // A run is SUCCESS only when EVERY configuration succeeded. A run executes
      // one configuration per account, so one account importing while four failed
      // is a partial import, not a completed one — reporting it green hid the four
      // from run history, from the failure notification, and (worst) from the
      // recovery sweep, which then never imported them at all. `totalCount > 0`
      // keeps the rule from being vacuously satisfied by a run that executed
      // nothing: that stays a failure, as it was before.
      allConfigurationsSucceeded = totalCount > 0 && successCount === totalCount;
      // Billing keeps the ORIGINAL rule ("at least one configuration imported"), which is
      // what `hasSuccessfulRun` gated before this branch. Tightening the status flag to
      // "all" moved three consumers at once — status, the success webhook and consumption —
      // but only the first two were intended. Under the tightened flag a four-of-five run
      // delivered four accounts' data and registered nothing, which is both wrong for us
      // and trivially exploitable: one permanently broken account makes a connector free.
      // Status stays strict; what the customer received is what gets billed.
      hasAnySuccessfulConfiguration = successCount > 0;
      // The user stopped a run that did not finish all its work. Still conditioned
      // on the full-success flag, but that flag now means "all", so a cancel that
      // lands mid-run is CANCELLED even when earlier configurations completed —
      // only a run that had already finished everything is left SUCCESS, because
      // then the abort cancelled nothing.
      wasCancelled = signal?.aborted === true && !allConfigurationsSucceeded;
      this.logger.log(
        `Connector execution completed: ${successCount}/${totalCount} configurations successful`,
        { dataMartId: dataMart.id, projectId: dataMart.projectId, runId, successCount, totalCount }
      );
    } catch (error) {
      // Nothing reaching here can have produced configuration results (the only
      // throw sites are before the per-configuration loop; inside it, failures are
      // captured per configuration), so the full-success flag is still false and
      // an aborted run is unambiguously CANCELLED.
      wasCancelled = signal?.aborted === true && !allConfigurationsSucceeded;
      const errorMessage = error instanceof Error ? error.message : String(error);
      addBoundedMessage(capturedErrors, {
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
      const hasSuccessfulFieldsUpdate = configurationResults.some(
        result => result.success && result.fieldsUpdate
      );

      try {
        await this.persistSuccessfulFieldsUpdate(dataMart, configurationResults, runId);
      } catch (error) {
        const fieldsUpdateError = error instanceof Error ? error.message : String(error);
        const warning =
          'Connector data was imported, but the source field list could not be synchronized. It will be retried on the next run.';
        addBoundedMessage(capturedLogs, {
          type: ConnectorMessageType.WARNING,
          at: this.systemTimeService.now().toISOString(),
          warning,
          toFormattedString: () => `[WARNING] ${warning}`,
        });
        this.logger.error(
          `Error saving connector source fields update: ${fieldsUpdateError}`,
          (error as Error)?.stack,
          {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
            error: fieldsUpdateError,
          }
        );
      }

      if (hasSuccessfulFieldsUpdate) {
        await this.actualizeSchemaAfterConnectorExecution(dataMart, runId);
      }

      await logFlusher?.stop();
      // Read after stop(), which awaits every started flush: this is exactly what this
      // execution's flusher put in the row, and the terminal write is about to re-supply
      // all of it. Subtracted there so nothing is stored twice.
      const flushedSnapshot = logFlusher?.persistedSnapshot() ?? null;

      // When the terminal status write is skipped (the run was cancelled
      // concurrently and CANCELLED must win), billing and outcome events must
      // be skipped too: the persisted status is CANCELLED, and charging the
      // project or publishing a success/failure webhook would contradict it.
      const persistedStatus = await this.updateRunStatus(
        runId,
        allConfigurationsSucceeded,
        capturedLogs,
        capturedErrors,
        operationBlockedException,
        wasCancelled,
        flushedSnapshot
      );

      // Consumption is registered on ANY successful configuration, deliberately split from
      // the success webhook below: the customer received those rows whether or not a
      // sibling account failed, and "some data arrived" is not the same claim as "the run
      // succeeded". They were one condition until this branch tightened the flag, which
      // silently stopped billing every partial run.
      // INTERRUPTED is excluded on purpose: the recovery sweep resumes that run, and the
      // resumed attempt registers consumption itself, so billing here would charge twice
      // for one import. This state did not exist before this branch — INTERRUPTED used to
      // require that NOTHING had succeeded, so it could never overlap with a billable run.
      if (
        hasAnySuccessfulConfiguration &&
        persistedStatus !== null &&
        persistedStatus !== DataMartRunStatus.INTERRUPTED
      ) {
        await this.projectBillingService.registerConnectorRunConsumption(dataMart, runId);
      }

      if (allConfigurationsSucceeded && persistedStatus !== null) {
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
        persistedStatus !== null &&
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

      if (!hasSuccessfulFieldsUpdate) {
        await this.actualizeSchemaAfterConnectorExecution(dataMart, runId);
      }

      this.gracefulShutdownService.unregisterActiveProcess(processId);
    }
  }

  private async actualizeSchemaAfterConnectorExecution(
    dataMart: DataMart,
    runId: string
  ): Promise<void> {
    this.logger.debug(`Actualizing schema after connector execution`, {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
      runId,
    });

    try {
      await this.dataMartService.actualizeSchema(dataMart.id, dataMart.projectId);
    } catch (error) {
      const schemaError = error instanceof Error ? error.message : String(error);
      const logMeta = {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
        error: schemaError,
      };
      if (error instanceof CredentialsExpiredException) {
        // Customer must reconnect their storage — not ops-actionable, don't page
        this.logger.warn(`Error schema actualization: ${schemaError}`, logMeta);
      } else {
        this.logger.error(
          `Error schema actualization: ${schemaError}`,
          (error as Error)?.stack,
          logMeta
        );
      }
    }
  }

  private async runConnectorConfigurations(
    runId: string,
    processId: string,
    dataMart: DataMart,
    payload?: Record<string, unknown> | null,
    signal?: AbortSignal,
    liveLogs: ConnectorMessage[] = [],
    liveErrors: ConnectorMessage[] = []
  ): Promise<ConfigurationExecutionResult[]> {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;
    const configurationResults: ConfigurationExecutionResult[] = [];

    const customManifest = await this.connectorDefinitionService.tryResolveManifest(
      dataMart.projectId,
      connector.source.name,
      connector.source.version
    );
    const manifestForRunner = customManifest ? this.stripManifestForRunner(customManifest) : null;

    for (const [configIndex, config] of connector.source.configuration.entries()) {
      const configId = (config as Record<string, unknown>)._id as string;

      if (!configId) {
        // A stored configuration with no _id is a data-integrity defect in the data mart
        // definition — nothing the customer can act on, so it stays an error. It also has
        // to be recorded as a run error: skipping straight to `continue` left a run with
        // no configuration results, which persists as FAILED with errors = null and so
        // explains itself neither in run history nor in the failure email.
        const errorMessage = `Configuration at index ${configIndex} is missing _id. Skipping this configuration.`;
        this.logger.error(errorMessage, {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          configIndex,
        });
        configurationResults.push({
          configIndex,
          success: false,
          logs: [],
          errors: [
            {
              type: ConnectorMessageType.ERROR,
              at: this.systemTimeService.now().toISOString(),
              error: errorMessage,
              toFormattedString: () => `[ERROR] ${errorMessage}`,
            },
          ],
        });
        continue;
      }

      const configLogs: ConnectorMessage[] = [];
      const configErrors: ConnectorMessage[] = [];
      let success = false;
      let credentialUpdates: Record<string, unknown> | undefined;
      let fieldsUpdate: ConfigurationExecutionResult['fieldsUpdate'];
      let configForCredentialUpdates = config as Record<string, unknown>;
      let expectedCredentialValues: Record<string, unknown> | undefined;

      const logCaptureConfig = this.connectorOutputCaptureService.createCapture(
        (message: ConnectorMessage) => {
          switch (message.type) {
            case ConnectorMessageType.ERROR:
              addBoundedMessage(configErrors, message);
              addBoundedMessage(liveErrors, message);
              this.logger.error(`${message.toFormattedString()}`, {
                dataMartId: dataMart.id,
                projectId: dataMart.projectId,
                runId,
                configId,
              });
              break;
            case ConnectorMessageType.WARNING:
              // Still counts as a run failure (goes into configErrors, same as ERROR) so the
              // "finished without terminal success status" fallback below doesn't also fire —
              // it's just not paged as an ERROR-severity log.
              addBoundedMessage(configErrors, message);
              this.logger.warn(`${message.toFormattedString()}`, {
                dataMartId: dataMart.id,
                projectId: dataMart.projectId,
                runId,
                configId,
              });
              break;
            case ConnectorMessageType.REQUESTED_DATE:
              addBoundedMessage(configLogs, message);
              addBoundedMessage(liveLogs, message);
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
            case ConnectorMessageType.FIELDS_UPDATE:
              fieldsUpdate = {
                fields: message.fields,
              };
              break;
            case ConnectorMessageType.STATUS:
              if (message.status === Core.EXECUTION_STATUS.ERROR) {
                success = false;
                // Goes to logs, not errors: this flag carries no detail (just a numeric
                // code), and the actual cause arrives as its own ERROR/WARNING message on
                // the same run. Recording it as an error would render a second, generic
                // ERROR row next to a run whose only real failure is a warning — and the
                // "finished without terminal success status" fallback below already
                // covers the case where no detail message arrives at all.
                addBoundedMessage(configLogs, message);
                addBoundedMessage(liveLogs, message);
                this.logger.warn(`${message.toFormattedString()}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              } else if (this.isSuccessfulConnectorStatus(message.status)) {
                success = true;
                addBoundedMessage(configLogs, message);
                addBoundedMessage(liveLogs, message);
                this.logger.log(`${message.status}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              } else {
                addBoundedMessage(configLogs, message);
                addBoundedMessage(liveLogs, message);
                this.logger.log(`${message.status}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              }
              break;
            default:
              addBoundedMessage(configLogs, message);
              addBoundedMessage(liveLogs, message);
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
          signal,
          manifestForRunner
        );

        // A connector can emit a terminal IMPORT_DONE yet ALSO log a hard error
        // (e.g. a per-account 429 after retries are exhausted) — that is a
        // failed/incomplete import, not a success. Such an error demotes the config
        // regardless of the order the status/error arrived.
        //
        // ERROR only, NOT `configErrors.length`: that array also collects WARNINGs, and a
        // WARNING is how the engine reports things it RECOVERED from — MicrosoftAds
        // "Scope … failed, trying next scope…" (the next scope then succeeds),
        // GoogleBigQueryStorage "Reducing batch size" (the halved MERGE then succeeds).
        // Counting those demoted a completed import to FAILED, which also skipped billing
        // and fired a failure notification. Whether a partially-skipped run is a failure is
        // the ENGINE's call — it fails the run itself when every account was skipped
        // (AbstractConnector._reportAccountOutcomes) — so the host must not re-decide it
        // from log severity.
        if (success && configErrors.some(m => m.type === ConnectorMessageType.ERROR)) {
          success = false;
        }

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
          // Only a shutdown makes this transient: that run is marked INTERRUPTED and the
          // retry sweep resumes it, continuing from its last completed date. Every other
          // cause reaching here — exiting 0 without IMPORT_DONE, or reporting STATUS:ERROR
          // with no detail — ends FAILED and is never resumed, so it stays an error.
          // Downgrading those would leave a fleet-wide regression with no error signal.
          const wasInterrupted = this.gracefulShutdownService.isInShutdownMode();
          const summary = `Configuration ${configIndex + 1} failed: ${errorMessage}`;
          const at = this.systemTimeService.now().toISOString();
          const logMeta = {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
            configId,
            configIndex,
          };

          addBoundedMessage(
            configErrors,
            wasInterrupted
              ? {
                  type: ConnectorMessageType.WARNING,
                  at,
                  warning: errorMessage,
                  toFormattedString: () => `[WARNING] ${errorMessage}`,
                }
              : {
                  type: ConnectorMessageType.ERROR,
                  at,
                  error: errorMessage,
                  toFormattedString: () => `[ERROR] ${errorMessage}`,
                }
          );

          if (wasInterrupted) {
            this.logger.warn(summary, logMeta);
          } else {
            this.logger.error(summary, logMeta);
          }
        }
      } catch (error) {
        success = false;
        const errorMessage = error instanceof Error ? error.message : String(error);
        // The user cancelled the run, or the customer must reconnect their storage.
        // Neither is ops-actionable, so it is a warning in run history as well as in
        // monitoring — deciding here keeps the persisted type and the log severity
        // from drifting apart.
        const isWarning = signal?.aborted === true || error instanceof CredentialsExpiredException;
        const summary = `Configuration ${configIndex + 1} failed: ${errorMessage}`;
        const at = this.systemTimeService.now().toISOString();
        const logMeta = {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          configId,
          configIndex,
          error: errorMessage,
        };

        addBoundedMessage(
          configErrors,
          isWarning
            ? {
                type: ConnectorMessageType.WARNING,
                at,
                warning: errorMessage,
                toFormattedString: () => `[WARNING] ${summary}`,
              }
            : {
                type: ConnectorMessageType.ERROR,
                at,
                error: errorMessage,
                toFormattedString: () => `[ERROR] ${summary}`,
              }
        );

        if (isWarning) {
          this.logger.warn(summary, logMeta);
        } else {
          this.logger.error(summary, (error as Error)?.stack, logMeta);
        }
      } finally {
        if (credentialUpdates) {
          try {
            const credentialsPersisted = await this.saveConnectorCredentials(
              configForCredentialUpdates,
              credentialUpdates,
              expectedCredentialValues,
              dataMart,
              runId,
              configId
            );
            if (!credentialsPersisted) {
              // Logs, not errors: the import itself completed, so this must not demote a
              // successful run (any entry in configErrors does). It belongs in run history
              // all the same — it is the only warning of an authentication failure that
              // will otherwise arrive, unexplained, on the NEXT run. Same shape as the
              // fields-update warning above, for the same reason.
              const warning =
                'Connector data was imported, but the refreshed credential could not be saved. ' +
                'If the next run fails to authenticate, reconnect this source.';
              addBoundedMessage(configLogs, {
                type: ConnectorMessageType.WARNING,
                at: this.systemTimeService.now().toISOString(),
                warning,
                toFormattedString: () => `[WARNING] ${warning}`,
              });
            }
          } catch (error) {
            success = false;
            const errorMessage = error instanceof Error ? error.message : String(error);
            const credentialErrorMessage = `Failed to update connector credentials: ${errorMessage}`;
            addBoundedMessage(configErrors, {
              type: ConnectorMessageType.ERROR,
              at: this.systemTimeService.now().toISOString(),
              error: credentialErrorMessage,
              toFormattedString: () => `[ERROR] ${credentialErrorMessage}`,
            });
          }
        }
        configurationResults.push({
          configIndex,
          success,
          logs: configLogs,
          errors: configErrors,
          fieldsUpdate,
        });
      }
    }

    return configurationResults;
  }

  private async persistSuccessfulFieldsUpdate(
    dataMart: DataMart,
    configurationResults: ConfigurationExecutionResult[],
    runId: string
  ): Promise<void> {
    const successfulFieldUpdates = configurationResults.flatMap(result =>
      result.success && result.fieldsUpdate ? [result.fieldsUpdate.fields] : []
    );
    if (successfulFieldUpdates.length === 0) {
      return;
    }

    const nextFields = this.normalizeFieldsUpdate(successfulFieldUpdates.flat());
    if (nextFields.length === 0) {
      return;
    }

    const wasSynchronized = await this.dataMartService.updateConnectorSourceFields(
      dataMart,
      nextFields
    );
    if (!wasSynchronized) {
      throw new Error('Data Mart definition changed while connector source fields were updating');
    }

    this.logger.log(`Updated connector source fields after successful connector run`, {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
      runId,
      fieldsCount: nextFields.length,
    });
  }

  private normalizeFieldsUpdate(fields: string[]): string[] {
    return Array.from(new Set(fields.map(field => field.trim()).filter(field => field.length > 0)));
  }

  /**
   * @returns false when a rotated credential was NOT stored because the guarded write
   * matched no row. Not a throw: the import succeeded and another writer legitimately
   * owns the credential now, but the caller has to be able to say so in run history —
   * this is the reason the next run will fail to authenticate.
   */
  private async saveConnectorCredentials(
    config: Record<string, unknown>,
    credentials: Record<string, unknown>,
    expectedCredentialValues: Record<string, unknown> | undefined,
    dataMart: DataMart,
    runId: string,
    configId: string
  ): Promise<boolean> {
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
        return true;
      }

      const credentialId = this.getCredentialIdForConfig(config);
      if (!credentialId) {
        this.logger.warn(
          `Rotated credential was not persisted: this connector has no stored credential. ` +
            `Configure it with a stored credential so the rotated token survives the next run.`,
          {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
            configId,
            credentialKeys: Object.keys(credentials),
          }
        );
        return false;
      }

      const result = expectedCredentialValues
        ? await this.connectorSourceCredentialsService.updateCredentialFields(
            credentialId,
            dataMart.projectId,
            credentialUpdates,
            expectedCredentialValues
          )
        : await this.connectorSourceCredentialsService.updateCredentialFields(
            credentialId,
            dataMart.projectId,
            credentialUpdates
          );

      if (!result.updated) {
        this.logger.warn(`Rotated connector credential was not persisted`, {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          configId,
          credentialId,
        });
      }

      return result.updated;
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

  private stripManifestForRunner(manifest: Record<string, unknown>): Record<string, unknown> {
    // The runner does not need display-only fields; dropping `logo` keeps the
    // OW_MANIFEST env var small.
    const { logo: _logo, ...rest } = manifest as Record<string, unknown> & { logo?: unknown };
    return rest;
  }

  /**
   * Build the incremental log flusher for a run, or `null` when incremental
   * streaming is disabled: when the configured interval is non-positive, and when the
   * run already carries output from an earlier attempt.
   *
   * The second case is not an optimization. This flusher REPLACES the row's logs/errors
   * with a snapshot of the CURRENT attempt's buffers, so on a resumed run its first tick
   * erases everything the previous attempt persisted — and the terminal merge, which
   * reads that same row, then has nothing left to merge. Live streaming for the tail of a
   * resumed run is worth far less than the history of how it got there, so the resumed
   * attempt writes once, at the end, through `updateRunStatus`.
   *
   * The snapshot serializes the run-scoped live buffers exactly as the terminal write
   * does; status/finishedAt are left to `updateRunStatus`.
   */
  private createRunLogFlusher(
    runId: string,
    liveLogs: ConnectorMessage[],
    liveErrors: ConnectorMessage[],
    hasOutputFromEarlierAttempt: boolean
  ): RunLogFlusher | null {
    if (hasOutputFromEarlierAttempt) return null;
    const intervalMs = this.configService.get<number>('CONNECTOR_RUN_LOG_FLUSH_INTERVAL_MS', 2000);
    if (intervalMs <= 0) return null;
    return new RunLogFlusher(
      intervalMs,
      createRunLogSnapshotReader(liveLogs, liveErrors),
      async ({ logs, errors }) => {
        await this.dataMartRunRepository.update(runId, {
          logs: logs.length > 0 ? logs : null,
          errors: errors.length > 0 ? errors : null,
        });
      },
      error =>
        this.logger.warn(
          `Incremental log flush failed for run ${runId}: ${castError(error).message}`
        )
    );
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
    allConfigurationsSucceeded: boolean,
    capturedLogs: ConnectorMessage[],
    capturedErrors: ConnectorMessage[],
    operationBlockedException?: ProjectOperationBlockedException,
    wasCancelled: boolean = false,
    flushedSnapshot: RunLogSnapshot | null = null
    // Returns the status actually persisted, or null when a concurrently committed
    // terminal status won. Callers need the status itself, not just "did it write":
    // billing must skip an INTERRUPTED run because the recovery sweep will run it
    // again and bill then, and re-deriving that condition at the call site would be
    // a second copy of the shutdown rule below, free to drift from it.
  ): Promise<DataMartRunStatus | null> {
    let status = wasCancelled
      ? DataMartRunStatus.CANCELLED
      : allConfigurationsSucceeded
        ? DataMartRunStatus.SUCCESS
        : operationBlockedException
          ? DataMartRunStatus.RESTRICTED
          : DataMartRunStatus.FAILED;
    // Shutdown cut the run short, so the sweep must resume it. This is gated on
    // *all* configurations having succeeded, never on merely some: a run that got
    // one account in before the pod stopped still has the rest left to import, and
    // marking it SUCCESS put it out of the sweep's reach so those accounts were
    // silently never imported. Cancellation still wins over INTERRUPTED — a run
    // the user stopped must not be resurrected.
    if (
      !wasCancelled &&
      !allConfigurationsSucceeded &&
      this.gracefulShutdownService.isInShutdownMode()
    ) {
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
      newErrorStrings,
      flushedSnapshot
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
      return status;
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

    return null;
  }

  /**
   * Concatenates this execution's captured output onto whatever is already
   * persisted for the run, so a resumed or superseded attempt extends the log
   * trail instead of replacing it.
   *
   * `flushedSnapshot` is what THIS execution's incremental flusher already wrote, and
   * `newLogStrings`/`newErrorStrings` re-supply all of it. It is discounted from the
   * persisted baseline so the run does not store each of those messages twice — which
   * doubled run history, reached the merged-output cap at half the real volume, and
   * repeated every error in the failure notification.
   */
  private async mergeWithPersistedOutput(
    runId: string,
    newLogStrings: string[],
    newErrorStrings: string[],
    flushedSnapshot: RunLogSnapshot | null = null
  ): Promise<{ logs: string[] | null; errors: string[] | null }> {
    const existing = await this.dataMartRunRepository.findOne({ where: { id: runId } });
    const existingLogs = this.discountFlushedEntries(
      (existing?.logs as string[] | null) ?? [],
      flushedSnapshot?.logs,
      newLogStrings
    );
    const existingErrors = this.discountFlushedEntries(
      (existing?.errors as string[] | null) ?? [],
      flushedSnapshot?.errors,
      newErrorStrings
    );

    const mergedLogs = this.capMergedEntries([...existingLogs, ...newLogStrings]);
    const mergedErrors = this.capMergedEntries([...existingErrors, ...newErrorStrings]);

    return {
      logs: mergedLogs.length > 0 ? mergedLogs : null,
      errors: mergedErrors.length > 0 ? mergedErrors : null,
    };
  }

  /**
   * Removes this execution's own intermediate flush from the persisted baseline.
   *
   * The flusher REPLACES the column with a full snapshot of the live buffers, so its
   * entries sit at the tail of what is stored; anything before them belongs to an
   * earlier attempt and must survive. Only an exact tail match is removed — if another
   * writer has since changed the row, the baseline is kept whole, because storing a
   * message twice is a far smaller fault than losing it.
   *
   * The same reasoning drives the `replacement` guard: this execution's terminal payload
   * is a superset of what it flushed, so a shorter payload means the two are not the
   * same output and nothing may be discounted.
   */
  private discountFlushedEntries(
    persisted: string[],
    flushed: string[] | undefined,
    replacement: string[]
  ): string[] {
    if (!flushed?.length || flushed.length > persisted.length) {
      return persisted;
    }
    if (flushed.length > replacement.length) {
      return persisted;
    }

    const start = persisted.length - flushed.length;
    for (let i = 0; i < flushed.length; i++) {
      if (persisted[start + i] !== flushed[i]) {
        return persisted;
      }
    }

    return persisted.slice(0, start);
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
