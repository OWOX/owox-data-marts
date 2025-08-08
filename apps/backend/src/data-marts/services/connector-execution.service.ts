import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ConnectorRunner,
  Config,
  StorageConfig,
  SourceConfig,
  RunConfig,
} from '@owox/connector-runner';

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
import { ConnectorOutputState } from '../connector-types/interfaces/connector-output-state';
import { ConnectorStateService } from '../connector-types/connector-message/services/connector-state.service';
import { DataMartService } from './data-mart.service';
import { DataMartStatus } from '../enums/data-mart-status.enum';

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
    private readonly dataMartService: DataMartService
  ) {}

  async cancelRun(dataMartId: string, runId: string): Promise<void> {
    const run = await this.dataMartRunRepository.findOne({
      where: {
        id: runId,
        dataMartId,
      },
    });

    if (!run) {
      throw new Error('Data mart run not found');
    }

    if (run.status === DataMartRunStatus.SUCCESS || run.status === DataMartRunStatus.FAILED) {
      throw new Error('Cannot cancel completed data mart run');
    }

    if (run.status === DataMartRunStatus.CANCELLED) {
      throw new Error('Data mart run is already cancelled');
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
  async run(dataMart: DataMart, payload?: Record<string, unknown>): Promise<string> {
    this.validateDataMartForConnector(dataMart);
    const isRunning = await this.checkDataMartIsRunning(dataMart);
    if (isRunning) {
      throw new Error('DataMart is already running');
    }

    const dataMartRun = await this.createDataMartRun(dataMart, payload);

    this.executeInBackground(dataMart, dataMartRun.id, payload).catch(error => {
      this.logger.error(`Background execution failed for run ${dataMartRun.id}:`, error);
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
      throw new Error('DataMart is not a connector type');
    }

    if (dataMart.status !== DataMartStatus.PUBLISHED) {
      throw new Error('DataMart is not published');
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
    payload?: Record<string, unknown>
  ): Promise<DataMartRun> {
    const dataMartRun = this.dataMartRunRepository.create({
      dataMartId: dataMart.id,
      definitionRun: dataMart.definition,
      status: DataMartRunStatus.PENDING,
      logs: [],
      errors: [],
      additionalParams: payload ? { payload: payload } : undefined,
    });

    return this.dataMartRunRepository.save(dataMartRun);
  }

  private async executeInBackground(
    dataMart: DataMart,
    runId: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    const state: ConnectorOutputState = { state: {}, at: '' };
    const capturedLogs: ConnectorMessage[] = [];
    const capturedErrors: ConnectorMessage[] = [];

    try {
      await this.dataMartRunRepository.update(runId, {
        status: DataMartRunStatus.RUNNING,
      });
      const configurationResults = await this.runConnectorConfigurations(
        runId,
        dataMart,
        state,
        payload
      );

      configurationResults.forEach(result => {
        capturedLogs.push(...result.logs);
        capturedErrors.push(...result.errors);
      });

      const successCount = configurationResults.filter(r => r.success).length;
      const totalCount = configurationResults.length;
      this.logger.log(
        `Connector execution completed: ${successCount}/${totalCount} configurations successful for DataMart ${dataMart.id}`
      );
    } catch (error) {
      capturedErrors.push({
        type: ConnectorMessageType.ERROR,
        at: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        toFormattedString: () =>
          `[ERROR] ${error instanceof Error ? error.message : String(error)}`,
      });
      this.logger.error(`Error running connector configurations: ${error}`);
    } finally {
      await this.updateRunStatus(runId, capturedLogs, capturedErrors);
      await this.updateRunState(dataMart.id, state);

      this.logger.debug(`Actualizing schema for DataMart ${dataMart.id} after connector execution`);
      await this.dataMartService.actualizeSchema(
        dataMart.id,
        dataMart.projectId,
        dataMart.createdById
      );
    }
  }

  private async runConnectorConfigurations(
    runId: string,
    dataMart: DataMart,
    state: ConnectorOutputState,
    payload?: Record<string, unknown>
  ): Promise<ConfigurationExecutionResult[]> {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;

    const configurationResults: ConfigurationExecutionResult[] = [];

    for (const [configIndex, config] of connector.source.configuration.entries()) {
      const configLogs: ConnectorMessage[] = [];
      const configErrors: ConnectorMessage[] = [];
      let success = true;

      const logCaptureConfig = this.connectorOutputCaptureService.createCapture(
        (message: ConnectorMessage) => {
          switch (message.type) {
            case ConnectorMessageType.ERROR:
              configErrors.push(message);
              this.logger.error(`${message.toFormattedString()}`);
              success = false;
              break;
            case ConnectorMessageType.REQUESTED_DATE:
              state.state = { date: message.date };
              state.at = message.at;
              break;
            case ConnectorMessageType.STATUS:
              if (message.status.includes('error')) {
                success = false;
                configErrors.push(message);
                this.logger.error(`${message.toFormattedString()}`);
              } else {
                configLogs.push(message);
                this.logger.log(`${message.toFormattedString()}`);
              }
              break;
            default:
              configLogs.push(message);
              this.logger.log(`${message.toFormattedString()}`);
              break;
          }
        }
      );

      try {
        const configuration = new Config({
          name: connector.source.name,
          datamartId: dataMart.id,
          source: await this.getSourceConfig(dataMart.id, connector, config),
          storage: this.getStorageConfig(dataMart),
        });
        const runConfig = this.getRunConfig(payload, state);
        const connectorRunner = new ConnectorRunner();
        await connectorRunner.run(dataMart.id, runId, configuration, runConfig, logCaptureConfig);
        if (configErrors.length === 0) {
          this.logger.log(
            `Configuration ${configIndex + 1} completed successfully for DataMart ${dataMart.id}`
          );
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
          `Configuration ${configIndex + 1} failed for DataMart ${dataMart.id}:`,
          error
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

  private async updateRunStatus(
    runId: string,
    capturedLogs: ConnectorMessage[],
    capturedErrors: ConnectorMessage[]
  ): Promise<void> {
    const status = capturedErrors.length > 0 ? DataMartRunStatus.FAILED : DataMartRunStatus.SUCCESS;

    await this.dataMartRunRepository.update(runId, {
      status,
      logs: capturedLogs.map(log => JSON.stringify(log)),
      errors: capturedErrors.map(error => JSON.stringify(error)),
    });
  }

  private async updateRunState(dataMartId: string, state: ConnectorOutputState): Promise<void> {
    if (state.state.date) {
      await this.connectorStateService.updateState(dataMartId, state);
    }
  }

  private async getSourceConfig(
    dataMartId: string,
    connector: DataMartConnectorDefinition['connector'],
    config: Record<string, unknown>
  ): Promise<SourceConfig> {
    const fieldsConfig = connector.source.fields
      .map(field => `${connector.source.node} ${field}`)
      .join(', ');
    const state = await this.connectorStateService.getState(dataMartId);

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
        throw new Error(`Unsupported storage type: ${dataMart.storage.type}`);
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
        DestinationTableNamePrefix: '',
        DestinationTableName: connector.storage?.fullyQualifiedName.split('.')[1],
        AthenaOutputLocation: `s3://${clearBucketName}/owox-data-marts/${dataMart.id}`,
      },
    });
  }

  private getRunConfig(payload?: Record<string, unknown>, state?: ConnectorOutputState): RunConfig {
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
      state: state?.state,
    });
  }
}
