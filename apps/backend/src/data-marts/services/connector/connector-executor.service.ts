import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';

const { ConfigDto } = Core;
type ConfigDto = InstanceType<typeof Core.ConfigDto>;

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
import { OWOX_PRODUCER } from '../../../common/producer/producer.module';
import { OwoxProducer } from '@owox/internal-helpers';
import { ConnectorRunSuccessfullyEvent } from '../../events/connector-run-successfully.event';
import { ProjectBalanceService } from '../project-balance.service';
import { ConnectorProcessSpawnerService } from './connector-process-spawner.service';
import { ConnectorStorageConfigService } from './connector-storage-config.service';
import { ConnectorSourceConfigService } from './connector-source-config.service';
import { ConnectorCredentialInjectorService } from './connector-credential-injector.service';
import { addMessageToArray } from './connector-message.utils';

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
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly projectBalanceService: ProjectBalanceService,
    private readonly dataMartService: DataMartService
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
    let hasSuccessfulRun = false;
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
      this.logger.log(
        `Connector execution completed: ${successCount}/${totalCount} configurations successful`,
        { dataMartId: dataMart.id, projectId: dataMart.projectId, runId, successCount, totalCount }
      );
    } catch (error) {
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
        operationBlockedException
      );

      if (hasSuccessfulRun) {
        await this.consumptionTracker.registerConnectorRunConsumption(dataMart, runId);
        await this.producer.produceEvent(
          new ConnectorRunSuccessfullyEvent(
            dataMart.id,
            runId,
            dataMart.projectId,
            run.createdById ?? 'system',
            run.runType
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
              } else {
                success = true;
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
        configurationResults.push({ configIndex, success, logs: configLogs, errors: configErrors });
      }
    }

    return configurationResults;
  }

  private async updateRunStatus(
    runId: string,
    hasSuccessfulRun: boolean,
    capturedLogs: ConnectorMessage[],
    capturedErrors: ConnectorMessage[],
    mergeWithExisting: boolean = false,
    operationBlockedException?: ProjectOperationBlockedException
  ): Promise<void> {
    const hasLogs = capturedLogs.length > 0;
    const hasErrors = capturedErrors.length > 0;
    let status = hasSuccessfulRun
      ? DataMartRunStatus.SUCCESS
      : operationBlockedException
        ? DataMartRunStatus.RESTRICTED
        : DataMartRunStatus.FAILED;
    if (this.gracefulShutdownService.isInShutdownMode()) {
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
