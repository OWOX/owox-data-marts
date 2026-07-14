import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { ConfigDto, GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD } = Core;
type ConfigDto = InstanceType<typeof Core.ConfigDto>;
const GENERATED_REFRESH_TOKEN_MAX_LENGTH = 4096;
const GOOGLE_SHEETS_SOURCE_NAME = 'GoogleSheets';

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

interface ConfigurationExecutionResult {
  configIndex: number;
  success: boolean;
  logs: ConnectorMessage[];
  errors: ConnectorMessage[];
  fieldsUpdate?: string[];
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
    const mergeWithExisting = run.status === DataMartRunStatus.INTERRUPTED;

    this.gracefulShutdownService.registerActiveProcess(processId);

    const capturedLogs: ConnectorMessage[] = [];
    const capturedErrors: ConnectorMessage[] = [];
    let configurationResults: ConfigurationExecutionResult[] = [];
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

      await this.dataMartRunRepository.update(runId, {
        status: DataMartRunStatus.RUNNING,
        ...(mergeWithExisting ? {} : { startedAt: this.systemTimeService.now() }),
        finishedAt: null,
      });

      configurationResults = await this.runConnectorConfigurations(
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
      await this.updateRunStatus(
        runId,
        hasSuccessfulRun,
        capturedLogs,
        capturedErrors,
        mergeWithExisting,
        operationBlockedException,
        wasCancelled
      );

      try {
        await this.persistSuccessfulFieldsUpdate(dataMart, configurationResults, runId);
      } catch (error) {
        const fieldsUpdateError = error instanceof Error ? error.message : String(error);
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

      if (hasSuccessfulRun) {
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
      } else if (!wasCancelled && !this.gracefulShutdownService.isInShutdownMode()) {
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
      let fieldsUpdate: string[] | undefined;
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
            case ConnectorMessageType.FIELDS_UPDATE:
              fieldsUpdate = message.fields;
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
    const definition = dataMart.definition as DataMartConnectorDefinition | undefined;
    if (definition?.connector.source.name !== GOOGLE_SHEETS_SOURCE_NAME) {
      return;
    }

    const successfulResultsWithFields = configurationResults.filter(
      result => result.success && result.fieldsUpdate
    );
    const successfulFieldsUpdate =
      successfulResultsWithFields[successfulResultsWithFields.length - 1]?.fieldsUpdate;

    if (!successfulFieldsUpdate) {
      return;
    }

    const nextFields = this.normalizeFieldsUpdate(successfulFieldsUpdate);
    if (nextFields.length === 0) {
      return;
    }

    const wasUpdated = await this.dataMartService.updateConnectorSourceFields(
      dataMart.id,
      dataMart.projectId,
      nextFields
    );

    if (!wasUpdated) {
      return;
    }

    this.logger.log(`Updated Google Sheets source fields after successful connector run`, {
      dataMartId: dataMart.id,
      projectId: dataMart.projectId,
      runId,
      fieldsCount: nextFields.length,
    });
  }

  private normalizeFieldsUpdate(fields: string[]): string[] {
    return Array.from(
      new Set(
        fields
          .map(field => field.trim())
          .filter(field => field.length > 0)
      )
    );
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

  private async updateRunStatus(
    runId: string,
    hasSuccessfulRun: boolean,
    capturedLogs: ConnectorMessage[],
    capturedErrors: ConnectorMessage[],
    mergeWithExisting: boolean = false,
    operationBlockedException?: ProjectOperationBlockedException,
    wasCancelled: boolean = false
  ): Promise<void> {
    const hasLogs = capturedLogs.length > 0;
    const hasErrors = capturedErrors.length > 0;
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

    const newLogStrings = hasLogs ? capturedLogs.map(log => JSON.stringify(log)) : [];
    const newErrorStrings = hasErrors ? capturedErrors.map(error => JSON.stringify(error)) : [];

    let logsToSave: string[] | null = newLogStrings.length > 0 ? newLogStrings : null;
    let errorsToSave: string[] | null = newErrorStrings.length > 0 ? newErrorStrings : null;

    if (mergeWithExisting) {
      const existing = await this.dataMartRunRepository.findOne({ where: { id: runId } });
      const existingLogs = (existing?.logs as string[] | null) ?? [];
      const existingErrors = (existing?.errors as string[] | null) ?? [];

      const mergedLogs = [...existingLogs, ...newLogStrings];
      const mergedErrors = [...existingErrors, ...newErrorStrings];

      logsToSave = mergedLogs.length > 0 ? mergedLogs : null;
      errorsToSave = mergedErrors.length > 0 ? mergedErrors : null;
    }

    await this.dataMartRunRepository.update(runId, {
      status,
      finishedAt: this.systemTimeService.now(),
      logs: logsToSave,
      errors: errorsToSave,
    });
  }
}
