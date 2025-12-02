import { Inject, Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../common/exceptions/business-violation.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

// @ts-expect-error - Package lacks TypeScript declarations
import { Core } from '@owox/connectors';
import { spawn } from 'cross-spawn';

const { ConfigDto, StorageConfigDto, SourceConfigDto, RunConfigDto } = Core;
type ConfigDto = InstanceType<typeof Core.ConfigDto>;
type StorageConfigDto = InstanceType<typeof Core.StorageConfigDto>;
type SourceConfigDto = InstanceType<typeof Core.SourceConfigDto>;
type RunConfigDto = InstanceType<typeof Core.RunConfigDto>;

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
import { SnowflakeConfig } from '../data-storage-types/snowflake/schemas/snowflake-config.schema';
import { SnowflakeCredentials } from '../data-storage-types/snowflake/schemas/snowflake-credentials.schema';
import { ConnectorMessage } from '../connector-types/connector-message/schemas/connector-message.schema';
import { ConnectorOutputCaptureService } from '../connector-types/connector-message/services/connector-output-capture.service';
import { ConnectorMessageType } from '../connector-types/enums/connector-message-type-enum';
import { ConnectorStateItem } from '../connector-types/interfaces/connector-state';
import { ConnectorStateService } from '../connector-types/connector-message/services/connector-state.service';
import { ConsumptionTrackingService } from './consumption-tracking.service';
import { DataMartService } from './data-mart.service';
import { DataMartStatus } from '../enums/data-mart-status.enum';
import { GracefulShutdownService } from '../../common/scheduler/services/graceful-shutdown.service';
import { SystemTimeService } from '../../common/scheduler/services/system-time.service';
import { ConnectorExecutionError } from '../errors/connector-execution.error';
import { OWOX_PRODUCER } from '../../common/producer/producer.module';
import { OwoxProducer } from '@owox/internal-helpers';
import { ConnectorRunSuccessfullyEvent } from '../events/connector-run-successfully.event';
import { RunType } from '../../common/scheduler/shared/types';
import { DataMartRunType } from '../enums/data-mart-run-type.enum';
import { ConnectorSourceCredentialsService } from './connector-source-credentials.service';
import { ConnectorService } from './connector.service';

interface ConfigurationExecutionResult {
  configIndex: number;
  success: boolean;
  logs: ConnectorMessage[];
  errors: ConnectorMessage[];
}

@Injectable()
export class ConnectorExecutionService {
  private readonly logger = new Logger(ConnectorExecutionService.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly connectorOutputCaptureService: ConnectorOutputCaptureService,
    private readonly connectorStateService: ConnectorStateService,
    private readonly dataMartService: DataMartService,
    private readonly gracefulShutdownService: GracefulShutdownService,
    private readonly consumptionTracker: ConsumptionTrackingService,
    private readonly systemTimeService: SystemTimeService,
    @Inject(OWOX_PRODUCER)
    private readonly producer: OwoxProducer,
    private readonly connectorSourceCredentialsService: ConnectorSourceCredentialsService,
    private readonly connectorService: ConnectorService
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
        finishedAt: this.systemTimeService.now(),
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
      where: {
        dataMartId: dataMart.id,
        status: DataMartRunStatus.RUNNING,
        type: DataMartRunType.CONNECTOR,
      },
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
      type: DataMartRunType.CONNECTOR,
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
    payload?: Record<string, unknown> | null
  ): Promise<void> {
    const runId = run.id;
    const processId = `connector-run-${runId}`;
    const mergeWithExisting = run.status === DataMartRunStatus.INTERRUPTED;

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
        startedAt: this.systemTimeService.now(),
        finishedAt: null,
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
      await this.updateRunStatus(runId, capturedLogs, capturedErrors, mergeWithExisting);

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
    payload?: Record<string, unknown> | null
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
        const refreshedConfig = await this.refreshCredentialsForConfig(
          dataMart.projectId,
          connector.source.name,
          config
        );

        const configuration = new ConfigDto({
          name: connector.source.name,
          datamartId: dataMart.id,
          source: await this.getSourceConfig(
            dataMart.id,
            dataMart.projectId,
            connector,
            refreshedConfig,
            configId
          ),
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

  private async runConnector(
    datamartId: string,
    runId: string,
    configuration: ConfigDto,
    runConfig: RunConfigDto,
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

      const env = {
        ...process.env,
        OW_DATAMART_ID: datamartId,
        OW_RUN_ID: runId,
        OW_CONFIG: JSON.stringify(configuration.toObject()),
        OW_RUN_CONFIG: JSON.stringify(runConfig.toObject()),
      };

      this.logger.log(
        `Spawning new process for connector runner execution for datamart ${datamartId} and run ${runId}`,
        {
          datamartId,
          runId,
        }
      );

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

      node.on('close', (code, signal) => {
        if (code === 0) {
          resolve();
          return;
        }

        if (this.gracefulShutdownService.isInShutdownMode()) {
          this.logger.log(
            `Connector process terminated during graceful shutdown: code=${String(code)}, signal=${String(
              signal
            )}`
          );
          resolve();
          return;
        }

        reject(new Error(`Connector process exited with code ${code}`));
      });

      node.on('error', error => {
        reject(error);
      });
    });
  }

  private async updateRunStatus(
    runId: string,
    capturedLogs: ConnectorMessage[],
    capturedErrors: ConnectorMessage[],
    mergeWithExisting: boolean = false
  ): Promise<void> {
    const hasLogs = capturedLogs.length > 0;
    const hasErrors = capturedErrors.length > 0;
    let status = hasErrors ? DataMartRunStatus.FAILED : DataMartRunStatus.SUCCESS;
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

  //TODO
  private async getSourceConfig(
    dataMartId: string,
    projectId: string,
    connector: DataMartConnectorDefinition['connector'],
    config: Record<string, unknown>,
    configId: string
  ): Promise<SourceConfigDto> {
    const fieldsConfig = connector.source.fields
      .map(field => `${connector.source.node} ${field}`)
      .join(', ');

    const state = await this.connectorStateService.getState(dataMartId, configId);

    const configWithCredentials = await this.injectOAuthCredentials(
      config,
      connector.source.name,
      projectId
    );
    return new SourceConfigDto({
      name: connector.source.name,
      config: {
        ...configWithCredentials,
        Fields: fieldsConfig,
        ...(state?.state?.date
          ? { LastRequestedDate: new Date(state.state.date as string).toISOString().split('T')[0] }
          : {}),
      },
    });
  }

  private getStorageConfig(dataMart: DataMart): StorageConfigDto {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;

    switch (dataMart.storage.type as DataStorageType) {
      case DataStorageType.GOOGLE_BIGQUERY:
        return this.createBigQueryStorageConfig(dataMart, connector);

      case DataStorageType.AWS_ATHENA:
        return this.createAthenaStorageConfig(dataMart, connector);

      case DataStorageType.SNOWFLAKE:
        return this.createSnowflakeStorageConfig(dataMart, connector);

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
  ): StorageConfigDto {
    const storageConfig = dataMart.storage.config as BigQueryConfig;
    const credentials = dataMart.storage.credentials as BigQueryCredentials;
    const datasetId = connector.storage?.fullyQualifiedName.split('.')[0];

    return new StorageConfigDto({
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
  ): StorageConfigDto {
    const storageConfig = dataMart.storage.config as AthenaConfig;
    const credentials = dataMart.storage.credentials as AthenaCredentials;
    const clearBucketName = storageConfig.outputBucket.replace(/^s3:\/\//, '').replace(/\/$/, '');
    return new StorageConfigDto({
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

  private createSnowflakeStorageConfig(
    dataMart: DataMart,
    connector: DataMartConnectorDefinition['connector']
  ): StorageConfigDto {
    const storageConfig = dataMart.storage.config as SnowflakeConfig;
    const credentials = dataMart.storage.credentials as SnowflakeCredentials;

    const fqnParts = connector.storage?.fullyQualifiedName.split('.') || [];
    const database = fqnParts[0];
    const schema = fqnParts[1];
    const tableName = fqnParts[2];

    const baseConfig = {
      SnowflakeAccount: storageConfig.account,
      SnowflakeWarehouse: storageConfig.warehouse,
      SnowflakeDatabase: database,
      SnowflakeSchema: schema,
      SnowflakeRole: storageConfig.role || '',
      DestinationTableNameOverride: `${connector.source.node} ${tableName}`,
      SnowflakeUsername: credentials.username,
    };

    const authConfig =
      credentials.authMethod === 'PASSWORD'
        ? {
            SnowflakePassword: credentials.password,
            SnowflakeAuthenticator: 'SNOWFLAKE',
            SnowflakePrivateKey: '',
            SnowflakePrivateKeyPassphrase: '',
          }
        : {
            SnowflakePassword: '',
            SnowflakeAuthenticator: 'SNOWFLAKE_JWT',
            SnowflakePrivateKey: credentials.privateKey,
            SnowflakePrivateKeyPassphrase: credentials.privateKeyPassphrase || '',
          };

    return new StorageConfigDto({
      name: DataStorageType.SNOWFLAKE,
      config: {
        ...baseConfig,
        ...authConfig,
      },
    });
  }

  private getRunConfig(
    payload?: Record<string, unknown> | null,
    state?: ConnectorStateItem
  ): RunConfigDto {
    const type = payload?.runType || 'INCREMENTAL';
    const data = payload?.data
      ? Object.entries(payload.data).map(([key, value]) => {
          return {
            configField: key,
            value: value,
          };
        })
      : [];
    this.logger.debug(`Creating run config`, {
      payload,
      state,
    });
    this.logger.debug(`Returning run config`, {
      type,
      data,
      state: state?.state || {},
    });
    return new RunConfigDto({
      type,
      data,
      state: state?.state || {},
    });
  }

  /**
   * Get all connector runs by status
   */
  async getDataMartConnectorRunsByStatus(status: DataMartRunStatus): Promise<DataMartRun[]> {
    const runs = await this.dataMartRunRepository.find({
      where: { status },
      relations: ['dataMart'],
    });

    return runs.filter(run => run.type === DataMartRunType.CONNECTOR);
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
  public async executeInterruptedRuns(): Promise<void> {
    const interruptedRuns = await this.getDataMartConnectorRunsByStatus(
      DataMartRunStatus.INTERRUPTED
    );
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
   * Inject OAuth credentials into configuration if _source_credential_id is present
   * @param config - Configuration object that may contain _source_credential_id
   * @param connectorName - Name of the connector (e.g., "FacebookMarketing")
   * @param projectId - Project ID for credential validation
   * @returns Configuration with OAuth credentials injected
   */
  private async injectOAuthCredentials(
    config: Record<string, unknown>,
    connectorName: string,
    projectId: string
  ): Promise<Record<string, unknown>> {
    return (await this.injectOAuthCredentialsRecursive(
      config,
      '',
      connectorName,
      projectId
    )) as Record<string, unknown>;
  }

  /**
   * Recursively inject OAuth credentials into nested configuration structures
   */
  private async injectOAuthCredentialsRecursive(
    value: unknown,
    currentPath: string,
    connectorName: string,
    projectId: string
  ): Promise<unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const obj = value as Record<string, unknown>;
    const credentialId = obj._source_credential_id as string | undefined;

    if (credentialId) {
      try {
        const credentialsEntity =
          await this.connectorSourceCredentialsService.getCredentialsById(credentialId);

        if (!credentialsEntity) {
          this.logger.warn(
            `OAuth credentials not found for ID: ${credentialId}. Using config without OAuth tokens.`
          );
          return obj;
        }

        if (credentialsEntity.projectId !== projectId) {
          this.logger.warn(
            `OAuth credentials ${credentialId} belong to project ${credentialsEntity.projectId}, not ${projectId}. Skipping injection.`
          );
          return obj;
        }

        const isExpired = await this.connectorSourceCredentialsService.isExpired(credentialId);

        if (isExpired) {
          this.logger.warn(
            `OAuth tokens expired for credential ID: ${credentialId}. Connector may fail. Please re-authorize.`
          );
        }

        const spec = await this.connectorService.getItemByFieldPath(
          credentialsEntity.connectorName,
          currentPath
        );

        const mapping = spec.oauthParams?.mapping as Record<string, string> | undefined;

        const { _source_credential_id: _, ...restObj } = obj;

        if (!mapping) {
          this.logger.warn(
            `No mapping found for OAuth field ${currentPath}. Using credentials directly.`
          );
          return {
            ...restObj,
            ...credentialsEntity.credentials,
          };
        }

        const resolvedConfig: Record<string, unknown> = {};
        for (const [key, mappingConfig] of Object.entries(mapping)) {
          const resolved = this.resolveMapping(mappingConfig, credentialsEntity.credentials);
          resolvedConfig[key] = resolved;
        }

        return {
          ...restObj,
          ...resolvedConfig,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to inject OAuth credentials for ID: ${credentialId}: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined
        );
        return obj;
      }
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      result[key] = await this.injectOAuthCredentialsRecursive(
        val,
        newPath,
        connectorName,
        projectId
      );
    }

    return result;
  }

  /**
   * Resolve mapping config to get actual credential value
   * Mapping config format: { type: 'string', store: 'secret', key: 'accessToken' }
   * where 'key' is the field name in credentials
   */
  private resolveMapping(mappingConfig: unknown, credentials: Record<string, unknown>): unknown {
    if (!mappingConfig || typeof mappingConfig !== 'object') {
      return mappingConfig;
    }

    const config = mappingConfig as Record<string, unknown>;

    if (config.key && typeof config.key === 'string') {
      return credentials[config.key] ?? '';
    }

    return mappingConfig;
  }

  /**
   * Refresh credentials for a configuration before running the connector
   * Recursively looks for _source_credential_id and refreshes if needed
   */
  private async refreshCredentialsForConfig(
    projectId: string,
    connectorName: string,
    config: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return (await this.refreshCredentialsRecursive(
      projectId,
      connectorName,
      config,
      config
    )) as Record<string, unknown>;
  }

  /**
   * Recursively refresh credentials in nested configuration structures
   */
  private async refreshCredentialsRecursive(
    projectId: string,
    connectorName: string,
    value: unknown,
    rootConfig: Record<string, unknown>
  ): Promise<unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const obj = value as Record<string, unknown>;
    const credentialId = obj._source_credential_id as string | undefined;

    if (credentialId) {
      try {
        const newCredentialId = await this.connectorService.refreshCredentials(
          projectId,
          connectorName,
          rootConfig,
          credentialId
        );

        if (newCredentialId !== credentialId) {
          return {
            ...obj,
            _source_credential_id: newCredentialId,
          };
        }

        return obj;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to refresh credentials for ${credentialId}: ${errorMessage}. Using existing credentials.`
        );
        return obj;
      }
    }

    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = await this.refreshCredentialsRecursive(
        projectId,
        connectorName,
        val,
        rootConfig
      );
    }

    return result;
  }
}
