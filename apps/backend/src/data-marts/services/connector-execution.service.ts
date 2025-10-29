import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';
import { spawn } from 'child_process';

const { Config, StorageConfig, SourceConfig, RunConfig } = Core;
type Config = InstanceType<typeof Core.Config>;
type StorageConfig = InstanceType<typeof Core.StorageConfig>;
type SourceConfig = InstanceType<typeof Core.SourceConfig>;
type RunConfig = InstanceType<typeof Core.RunConfig>;

import { ConnectorDefinition as DataMartConnectorDefinition } from '../dto/schemas/data-mart-table-definitions/connector-definition.schema';
import { DataMart } from '../entities/data-mart.entity';
import { DataMartRun } from '../entities/data-mart-run.entity';
import { DataMartDefinitionType } from '../enums/data-mart-definition-type.enum';
import { DataMartRunStatus } from '../enums/data-mart-run-status.enum';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { BigQueryConfig } from '../data-storage-types/bigquery/schemas/bigquery-config.schema';
import { AthenaConfig } from '../data-storage-types/athena/schemas/athena-config.schema';
import { AthenaCredentials } from '../data-storage-types/athena/schemas/athena-credentials.schema';
import { BigQueryCredentials } from '../data-storage-types/bigquery/schemas/bigquery-credentials.schema';
import { ConnectorMessage } from '../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorOutputCaptureService } from '../connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorMessageType } from '../connector-types/enums/connector-message-type-enum';
import { ConnectorStateItem } from '../connector-types/interfaces/connector-state';
import { ConnectorStateService } from '../connector-types/connector-message/services/connector-state.service';
import { ConsumptionTrackingService } from './consumption-tracking.service';
import { DataMartService } from './data-mart.service';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { ConnectorExecutionError } from '../errors/connector-execution.error';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { OwoxProducer } from '@owox/internal-helpers';
import { ConnectorRunSuccessfullyEvent } from '../events/connector-run-successfully.event';
import { RunType } from '../../common/scheduler/shared/types';

interface ConfigurationExecutionResult {
  configIndex: number;
  success: boolean;
  logs: ConnectorMessage[];
  errors: ConnectorMessage[];
}

@Injectable()
export class ConnectorExecutionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConnectorExecutionService.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly connectorOutputCaptureService: ConnectorOutputCaptureService,
    private readonly connectorStateService: ConnectorStateService,
    private readonly dataMartService: DataMartService,
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly consumptionTracker: ConsumptionTrackingService,
    private readonly configService: ConfigService,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer
  ) {}

  async cancelRun(dataMartId: string, runId: string): Promise<void> {
    const run = await this.dataMartRunRepository.findOne({
      where: {
        id: runId,
        dataMartId,
      },
    });

    if (!run) {
      throw new ConnectorExecutionError('Data mart run not found', undefined, {
        dataMartId,
        runId,
      });
    }

    if (run.status === DataMartRunStatus.SUCCESS || run.status === DataMartRunStatus.FAILED) {
      throw new ConnectorExecutionError('Cannot cancel completed data mart run', undefined, {
        dataMartId,
        runId,
        projectId: run?.dataMart?.projectId,
      });
    }

    if (run.status === DataMartRunStatus.CANCELLED) {
      throw new ConnectorExecutionError('Data mart run is already cancelled', undefined, {
        dataMartId,
        runId,
        projectId: run?.dataMart?.projectId,
      });
    }

    if (run.status === DataMartRunStatus.RUNNING) {
      await this.dataMartRunRepository.update(runId, {
        status: DataMartRunStatus.CANCELLED,
      });
    }
  }

  /**
   * Start a connector run
   */
  async run(
    dataMart: DataMart,
    createdById: string,
    runType: RunType,
    payload?: Record<string, unknown>
  ): Promise<string> {
    this.validateDataMartForConnector(dataMart);
    const isRunning = await this.checkDataMartIsRunning(dataMart);
    if (isRunning) {
      throw new BusinessViolationException(
        'Connector is already running. Please wait until it finishes'
      );
    }

    const dataMartRun = await this.createDataMartRun(dataMart, createdById, runType, payload);

    this.executeInBackground(dataMart, dataMartRun, payload).catch(error => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Background execution failed: ${errorMessage}`, error?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId: dataMartRun.id,
        error: errorMessage,
      });
    });

    return dataMartRun.id;
  }

  /**
   * Get run status by ID
   */
  async getRunStatus(runId: string): Promise<DataMartRun | null> {
    return this.dataMartRunRepository.findOne({
      where: { id: runId },
      relations: ['dataMart'],
    });
  }

  /**
   * Get all runs for a specific DataMart
   */
  async getDataMartRuns(
    dataMartId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<DataMartRun[]> {
    return this.dataMartRunRepository.find({
      where: { dataMartId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  private validateDataMartForConnector(dataMart: DataMart): void {
    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new ConnectorExecutionError('DataMart is not a connector type', undefined, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
      });
    }

    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new ConnectorExecutionError('DataMart is not published', undefined, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
      });
    }
  }

  private async checkDataMartIsRunning(dataMart: DataMart): Promise<boolean> {
    const dataMartRun = await this.dataMartRunRepository.findOne({
      where: { dataMartId: dataMart.id, status: DataMartRunStatus.RUNNING },
    });

    return !!dataMartRun;
  }

  private async createDataMartRun(
    dataMart: DataMart,
    createdById: string,
    runType: RunType,
    payload?: Record<string, unknown>
  ): Promise<DataMartRun> {
    const dataMartRun = this.dataMartRunRepository.create({
      dataMartId: dataMart.id,
      definitionRun: dataMart.definition,
      status: DataMartRunStatus.PENDING,
      createdById: createdById,
      runType: runType,
      logs: [],
      errors: [],
      additionalParams: payload ? { payload: payload } : undefined,
    });

    return this.dataMartRunRepository.save(dataMartRun);
  }

  private async executeInBackground(
    dataMart: DataMart,
    run: DataMartRun,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const runId = run.id;
    const processId = `connector-run-${runId}`;

    this.gracefulShutdownService.registerActiveProcess(processId);

    const capturedLogs: ConnectorMessage[] = [];
    const capturedErrors: ConnectorMessage[] = [];
    let hasSuccessfulRun = false;

    try {
      if (this.gracefulShutdownService.isInShutdownMode()) {
        throw new ConnectorExecutionError(
          'Skipping connector execution. Application is shutting down.',
          undefined,
          {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
          }
        );
      }

      await this.dataMartRunRepository.update(runId, {
        status: DataMartRunStatus.RUNNING,
      });
      const configurationResults = await this.runConnectorConfigurations(
        runId,
        processId,
        dataMart,
        payload
      );

      configurationResults.forEach(result => {
        capturedLogs.push(...result.logs);
        capturedErrors.push(...result.errors);
      });

      const successCount = configurationResults.filter(r => r.success).length;
      const totalCount = configurationResults.length;
      hasSuccessfulRun = successCount > 0;
      this.logger.log(
        `Connector execution completed: ${successCount}/${totalCount} configurations successful`,
        {
          dataMartId: dataMart.id,
          projectId: dataMart.projectId,
          runId,
          successCount,
          totalCount,
        }
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      capturedErrors.push({
        type: ConnectorMessageType.ERROR,
        at: new Date().toISOString(),
        error: errorMessage,
        toFormattedString: () => `[ERROR] ${errorMessage}`,
      });
      this.logger.error(`Error running connector configurations: ${errorMessage}`, error?.stack, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
        error: errorMessage,
      });
    } finally {
      await this.updateRunStatus(runId, capturedLogs, capturedErrors);

      if (hasSuccessfulRun) {
        // Register connector run consumption only if at least one configuration succeeded
        await this.consumptionTracker.registerConnectorRunConsumption(dataMart, runId);
        await this.producer.produceEvent(
          new ConnectorRunSuccessfullyEvent(
            dataMart.id,
            runId,
            dataMart.projectId,
            run.createdById!,
            run.runType!
          )
        );
      }

      this.logger.debug(`Actualizing schema after connector execution`, {
        dataMartId: dataMart.id,
        projectId: dataMart.projectId,
        runId,
      });

      // If the connector does not receive any data, the data storage resource will not be created.
      // The connector will complete its work with the status “SUCCESS” but don't unregister active process.
      try {
        await this.dataMartService.actualizeSchema(dataMart.id, dataMart.projectId);
      } catch (error) {
        const schemaError = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error schema actualization: ${schemaError}`, error?.stack, {
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
    payload?: Record<string, unknown>
  ): Promise<ConfigurationExecutionResult[]> {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;

    const configurationResults: ConfigurationExecutionResult[] = [];

    for (const [configIndex, config] of connector.source.configuration.entries()) {
      const configId = (config as Record<string, unknown>)._id as string;

      if (!configId) {
        this.logger.error(
          `Configuration at index ${configIndex} is missing _id. Skipping this configuration.`,
          {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            runId,
            configIndex,
          }
        );
        continue;
      }

      const configLogs: ConnectorMessage[] = [];
      const configErrors: ConnectorMessage[] = [];
      let success = true;

      const logCaptureConfig = this.connectorOutputCaptureService.createCapture(
        (message: ConnectorMessage) => {
          switch (message.type) {
            case ConnectorMessageType.ERROR:
              configErrors.push(message);
              this.logger.error(`${message.toFormattedString()}`, {
                dataMartId: dataMart.id,
                projectId: dataMart.projectId,
                runId,
                configId,
              });
              success = false;
              break;
            case ConnectorMessageType.REQUESTED_DATE:
              this.connectorStateService
                .updateState(dataMart.id, configId, {
                  state: { date: message.date },
                  at: message.at,
                })
                .catch(error => {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  this.logger.error(`Failed to save state: ${errorMessage}`, error?.stack, {
                    dataMartId: dataMart.id,
                    projectId: dataMart.projectId,
                    runId,
                    configId,
                    error: errorMessage,
                  });
                });
              break;
            case ConnectorMessageType.STATUS:
              if (message.status === Core.EXECUTION_STATUS.ERROR) {
                success = false;
                configErrors.push(message);
                this.logger.error(`${message.toFormattedString()}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              } else {
                configLogs.push(message);
                this.logger.log(`${message.status}`, {
                  dataMartId: dataMart.id,
                  projectId: dataMart.projectId,
                  runId,
                  configId,
                });
              }
              break;
            default:
              configLogs.push(message);
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
        const configuration = new Config({
          name: connector.source.name,
          datamartId: dataMart.id,
          source: await this.getSourceConfig(dataMart.id, connector, config, configId),
          storage: this.getStorageConfig(dataMart),
        });

        // Get state for this specific configuration
        const configState = await this.connectorStateService.getState(dataMart.id, configId);
        const runConfig = this.getRunConfig(payload, configState);

        await this.runConnector(dataMart.id, runId, configuration, runConfig, logCaptureConfig);
        if (configErrors.length === 0) {
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
        configErrors.push({
          type: ConnectorMessageType.ERROR,
          at: new Date().toISOString(),
          error: errorMessage,
          toFormattedString: () =>
            `[ERROR] Configuration ${configIndex + 1} failed: ${errorMessage}`,
        });
        this.logger.error(
          `Configuration ${configIndex + 1} failed: ${errorMessage}`,
          error?.stack,
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
        configurationResults.push({
          configIndex,
          success: success,
          logs: configLogs,
          errors: configErrors,
        });
      }
    }

    return configurationResults;
  }

  /**
   * Run connector using direct spawn without temporary directories
   */
  private async runConnector(
    datamartId: string,
    runId: string,
    configuration: Config,
    runConfig: RunConfig,
    stdio: {
      logCapture?: { onStdout?: (message: string) => void; onStderr?: (message: string) => void };
      onSpawn?: (pid: number | undefined) => void;
    }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let spawnStdio: 'inherit' | 'pipe' | Array<string | number> = 'inherit';
      let logCapture: {
        onStdout?: (message: string) => void;
        onStderr?: (message: string) => void;
      } | null = null;
      let onSpawn: ((pid: number | undefined) => void) | null = null;

      if (stdio && typeof stdio === 'object' && stdio.logCapture) {
        logCapture = stdio.logCapture;
        spawnStdio = 'pipe';
        if (typeof stdio.onSpawn === 'function') {
          onSpawn = stdio.onSpawn;
        }
      }

      // Prepare environment variables
      const env = {
        ...process.env,
        OW_DATAMART_ID: datamartId,
        OW_RUN_ID: runId,
        OW_CONFIG: JSON.stringify(configuration.toObject()),
        OW_RUN_CONFIG: JSON.stringify(runConfig),
      };

      // Spawn the connector runner directly
      // Use require.resolve to find the runner in the installed package
      const runnerPath = require.resolve('@owox/connectors/runner');

      const node = spawn('node', [runnerPath], {
        stdio: spawnStdio,
        env,
        detached: true,
      });

      if (onSpawn) {
        try {
          onSpawn(node.pid);
        } catch (error) {
          this.logger.error(
            `Failed to call onSpawn callback: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (logCapture && node.stdout && node.stderr) {
        node.stdout.on('data', data => {
          const message = data.toString();
          if (logCapture.onStdout) {
            logCapture.onStdout(message);
          }
        });

        node.stderr.on('data', data => {
          const message = data.toString();
          if (logCapture.onStderr) {
            logCapture.onStderr(message);
          }
        });
      }

      node.on('close', code => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Connector process exited with code ${code}`));
        }
      });

      node.on('error', error => {
        reject(error);
      });
    });
  }

  private async updateRunStatus(
    runId: string,
    capturedLogs: ConnectorMessage[],
    capturedErrors: ConnectorMessage[]
  ): Promise<void> {
    let status = capturedErrors.length > 0 ? DataMartRunStatus.FAILED : DataMartRunStatus.SUCCESS;
    if (this.gracefulShutdownService.isInShutdownMode()) {
      status = DataMartRunStatus.INTERRUPTED;
    }

    await this.dataMartRunRepository.update(runId, {
      status,
      logs: capturedLogs.map(log => JSON.stringify(log)),
      errors: capturedErrors.map(error => JSON.stringify(error)),
    });
  }

  //TODO
  private async getSourceConfig(
    dataMartId: string,
    connector: DataMartConnectorDefinition['connector'],
    config: Record<string, unknown>,
    configId: string
  ): Promise<SourceConfig> {
    const fieldsConfig = connector.source.fields
      .map(field => `${connector.source.node} ${field}`)
      .join(', ');

    const state = await this.connectorStateService.getState(dataMartId, configId);

    return new SourceConfig({
      name: connector.source.name,
      config: {
        ...config,
        Fields: fieldsConfig,
        ...(state?.state?.date
          ? { LastRequestedDate: new Date(state.state.date as string).toISOString().split('T')[0] }
          : {}),
      },
    });
  }

  private getStorageConfig(dataMart: DataMart): StorageConfig {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;

    switch (dataMart.storage.type as DataStorageType) {
      case DataStorageType.GOOGLE_BIGQUERY:
        return this.createBigQueryStorageConfig(dataMart, connector);

      case DataStorageType.AWS_ATHENA:
        return this.createAthenaStorageConfig(dataMart, connector);

      default:
        throw new ConnectorExecutionError(
          `Unsupported storage type: ${dataMart.storage.type}`,
          undefined,
          {
            dataMartId: dataMart.id,
            projectId: dataMart.projectId,
            storageType: dataMart.storage.type,
          }
        );
    }
  }

  private createBigQueryStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector']
  ): StorageConfig {
    const storageConfig = dataMart.storage.config as BigQueryConfig;
    const credentials = dataMart.storage.credentials as BigQueryCredentials;
    const datasetId = connector.storage?.fullyQualifiedName.split('.')[0];

    return new StorageConfig({
      name: DataStorageType.GOOGLE_BIGQUERY,
      config: {
        DestinationLocation: storageConfig?.location,
        DestinationDatasetID: `${storageConfig.projectId}.${datasetId}`,
        DestinationProjectID: storageConfig.projectId,
        DestinationDatasetName: datasetId,
        DestinationTableNameOverride: `${connector.source.node} ${connector.storage?.fullyQualifiedName.split('.')[1]}`,
        ProjectID: storageConfig.projectId,
        ServiceAccountJson: JSON.stringify(credentials),
      },
    });
  }

  private createAthenaStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector']
  ): StorageConfig {
    const storageConfig = dataMart.storage.config as AthenaConfig;
    const credentials = dataMart.storage.credentials as AthenaCredentials;
    const clearBucketName = storageConfig.outputBucket.replace(/^s3:\/\//, '').replace(/\/$/, '');
    return new StorageConfig({
      name: DataStorageType.AWS_ATHENA,
      config: {
        AWSRegion: storageConfig.region,
        AWSAccessKeyId: credentials.accessKeyId,
        AWSSecretAccessKey: credentials.secretAccessKey,
        S3BucketName: clearBucketName,
        S3Prefix: dataMart.id,
        AthenaDatabaseName: connector.storage?.fullyQualifiedName.split('.')[0],
        DestinationTableNameOverride: `${connector.source.node} ${connector.storage?.fullyQualifiedName.split('.')[1]}`,
        AthenaOutputLocation: `s3://${clearBucketName}/owox-data-marts/${dataMart.id}`,
      },
    });
  }

  private getRunConfig(payload?: Record<string, unknown>, state?: ConnectorStateItem): RunConfig {
    const type = payload?.runType || 'INCREMENTAL';
    const data = payload?.data
      ? Object.entries(payload.data).map(([key, value]) => {
          return {
            configField: key,
            value: value,
          };
        })
      : [];

    return new RunConfig({
      type,
      data,
      state: state?.state || {},
    });
  }

  /**
   * Get all runs by status
   */
  async getDataMartRunsByStatus(status: DataMartRunStatus): Promise<DataMartRun[]> {
    return this.dataMartRunRepository.find({
      where: { status },
      relations: ['dataMart'],
    });
  }

  /**
   * Executes background connector for data mart runs that are in the INTERRUPTED status.
   * Retrieves the list of interrupted runs, validates each run, checks if the respective data marts are already running,
   * and attempts to resume their execution in the background. Runs that are already executing will be skipped,
   * and runs that fail validation or execution will be logged with appropriate error messages.
   *
   * @return {Promise<void>} A promise that resolves when all interrupted runs have been processed,
   *                         with execution statistics logged (started, skipped, failed counts).
   */
  private async executeInterruptedRuns(): Promise<void> {
    const interruptedRuns = await this.getDataMartRunsByStatus(DataMartRunStatus.INTERRUPTED);
    if (interruptedRuns.length === 0) {
      this.logger.log('No interrupted runs found to resume');
      return;
    }

    this.logger.log(`Starting execution of ${interruptedRuns.length} interrupted runs...`);
    for (const run of interruptedRuns) {
      this.validateDataMartForConnector(run.dataMart);
      const isRunning = await this.checkDataMartIsRunning(run.dataMart);
      if (isRunning) {
        this.logger.warn(`Skipping interrupted run ${run.id}: DataMart is already running`, {
          dataMartId: run.dataMart.id,
          projectId: run.dataMart.projectId,
          runId: run.id,
        });
        continue;
      } else {
        this.logger.log(`Starting execution of interrupted run ${run.id}`, {
          dataMartId: run.dataMart.id,
          projectId: run.dataMart.projectId,
          runId: run.id,
        });
      }

      this.executeInBackground(run.dataMart, run, run.additionalParams).catch(error => {
        this.logger.error(
          `Interrupted background execution failed for run ${run.id}:`,
          error?.stack,
          {
            dataMartId: run.dataMart.id,
            projectId: run.dataMart.projectId,
            runId: run.id,
          }
        );
      });
    }
  }

  /**
   * Executes tasks or operations needed upon application bootstrap.
   * This method is invoked automatically when the application starts to ensure
   * any interrupted runs or pending processes are resumed and properly handled.
   *
   * Execution is controlled by the SCHEDULER_EXECUTION_ENABLED environment variable.
   * If disabled, the method will skip interrupted runs execution and log the reason.
   *
   * @return {Promise<void>} A promise that resolves when the bootstrap operations are completed.
   */
  async onApplicationBootstrap(): Promise<void> {
    const isExecutionEnabled = this.configService.get<boolean>('SCHEDULER_EXECUTION_ENABLED');

    if (!isExecutionEnabled) {
      this.logger.log('Skipping interrupted runs execution - scheduler execution disabled');
      return;
    }

    this.executeInterruptedRuns().catch(err =>
      this.logger.error('Failed to execute interrupted runs', err)
    );
  }
}
