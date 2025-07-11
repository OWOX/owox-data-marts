import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConnectorRunner, RunConfig, StorageConfig, SourceConfig } from '@owox/connector-runner';

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
import { DataMartService } from './data-mart.service';

interface LogCaptureConfig {
  logCapture: {
    onStdout: (message: string) => void;
    onStderr: (message: string) => void;
    passThrough: boolean;
  };
}

interface ConfigurationExecutionResult {
  configIndex: number;
  success: boolean;
  logs: string[];
  errors: string[];
}

@Injectable()
export class ConnectorExecutionService {
  private readonly logger = new Logger(ConnectorExecutionService.name);

  constructor(
    @InjectRepository(DataMartRun)
    private readonly dataMartRunRepository: Repository<DataMartRun>,
    private readonly dataMartService: DataMartService
  ) {}

  /**
   * Start a connector run
   */
  async run(dataMart: DataMart): Promise<string> {
    this.validateDataMartForConnector(dataMart);

    const dataMartRun = await this.createDataMartRun(dataMart);

    this.executeInBackground(dataMart, dataMartRun.id).catch(error => {
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
  async getDataMartRuns(dataMartId: string): Promise<DataMartRun[]> {
    return this.dataMartRunRepository.find({
      where: { dataMartId },
      order: { createdAt: 'DESC' },
    });
  }

  // Private helper methods

  private validateDataMartForConnector(dataMart: DataMart): void {
    if (dataMart.definitionType !== DataMartDefinitionType.CONNECTOR) {
      throw new Error('DataMart is not a connector type');
    }
  }

  private async createDataMartRun(dataMart: DataMart): Promise<DataMartRun> {
    const dataMartRun = this.dataMartRunRepository.create({
      dataMartId: dataMart.id,
      definitionRun: dataMart.definition,
      status: DataMartRunStatus.RUNNING,
      logs: [],
      errors: [],
    });

    return this.dataMartRunRepository.save(dataMartRun);
  }

  private createLogCaptureConfig(
    dataMartId: string,
    capturedErrors: string[],
    capturedLogs: string[]
  ): LogCaptureConfig {
    return {
      logCapture: {
        onStdout: (message: string) => {
          const logMessage = message.trim();
          capturedLogs.push(logMessage);
          this.logger.log(`[${dataMartId}]: ${logMessage}`);
        },
        onStderr: (message: string) => {
          const errorMessage = message.trim();
          capturedErrors.push(errorMessage);
          this.logger.error(`[${dataMartId}]: ${errorMessage}`);
        },
        passThrough: false,
      },
    };
  }

  private async executeInBackground(dataMart: DataMart, runId: string): Promise<void> {
    const capturedLogs: string[] = [];
    const capturedErrors: string[] = [];
    const logCaptureConfig = this.createLogCaptureConfig(dataMart.id, capturedErrors, capturedLogs);

    try {
      await this.runConnectorConfigurations(runId, dataMart, logCaptureConfig);
      await this.updateRunStatus(runId, capturedLogs, capturedErrors);
    } catch (error) {
      await this.handleRunFailure(runId, error, capturedLogs, capturedErrors, dataMart.id);
    } finally {
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
    logCaptureConfig: LogCaptureConfig
  ): Promise<void> {
    const definition = dataMart.definition as DataMartConnectorDefinition;
    const { connector } = definition;

    const configurationResults: ConfigurationExecutionResult[] = [];

    for (const [configIndex, config] of connector.source.configuration.entries()) {
      const configLogs: string[] = [];
      const configErrors: string[] = [];

      const configLogCapture = this.createConfigurationLogCaptureConfig(
        dataMart.id,
        configIndex,
        configErrors,
        configLogs
      );

      try {
        const runConfig = new RunConfig({
          name: connector.source.name,
          datamartId: dataMart.id,
          source: this.getSourceConfig(connector, config),
          storage: this.getStorageConfig(dataMart),
        });

        const connectorRunner = new ConnectorRunner();
        await connectorRunner.run(dataMart.id, runId, runConfig, configLogCapture);

        configurationResults.push({
          configIndex,
          success: true,
          logs: configLogs,
          errors: configErrors,
        });

        this.logger.log(
          `Configuration ${configIndex + 1} completed successfully for DataMart ${dataMart.id}`
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        configErrors.push(`Configuration ${configIndex + 1} failed: ${errorMessage}`);

        configurationResults.push({
          configIndex,
          success: false,
          logs: configLogs,
          errors: configErrors,
        });

        this.logger.error(
          `Configuration ${configIndex + 1} failed for DataMart ${dataMart.id}:`,
          error
        );
      }
    }

    this.mergeConfigurationResults(configurationResults, logCaptureConfig);

    const successCount = configurationResults.filter(r => r.success).length;
    const totalCount = configurationResults.length;
    this.logger.log(
      `Connector execution completed: ${successCount}/${totalCount} configurations successful for DataMart ${dataMart.id}`
    );
  }

  private createConfigurationLogCaptureConfig(
    dataMartId: string,
    configIndex: number,
    capturedErrors: string[],
    capturedLogs: string[]
  ): LogCaptureConfig {
    return {
      logCapture: {
        onStdout: (message: string) => {
          const logMessage = message.trim();
          capturedLogs.push(`[Config ${configIndex + 1}] ${logMessage}`);
          this.logger.log(`[${dataMartId}][Config ${configIndex + 1}]: ${logMessage}`);
        },
        onStderr: (message: string) => {
          const errorMessage = message.trim();
          capturedErrors.push(`[Config ${configIndex + 1}] ${errorMessage}`);
          this.logger.error(`[${dataMartId}][Config ${configIndex + 1}]: ${errorMessage}`);
        },
        passThrough: false,
      },
    };
  }

  private mergeConfigurationResults(
    configurationResults: ConfigurationExecutionResult[],
    originalLogCapture: LogCaptureConfig
  ): void {
    for (const result of configurationResults) {
      for (const log of result.logs) {
        originalLogCapture.logCapture.onStdout(log);
      }

      for (const error of result.errors) {
        originalLogCapture.logCapture.onStderr(error);
      }
    }
  }

  private async updateRunStatus(
    runId: string,
    capturedLogs: string[],
    capturedErrors: string[]
  ): Promise<void> {
    const status = capturedErrors.length > 0 ? DataMartRunStatus.FAILED : DataMartRunStatus.SUCCESS;

    await this.dataMartRunRepository.update(runId, {
      status,
      logs: capturedLogs,
      errors: capturedErrors,
    });
  }

  private async handleRunFailure(
    runId: string,
    error: unknown,
    capturedLogs: string[],
    capturedErrors: string[],
    dataMartId: string
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    capturedErrors.push(errorMessage);

    await this.dataMartRunRepository.update(runId, {
      status: DataMartRunStatus.FAILED,
      logs: capturedLogs,
      errors: capturedErrors,
    });

    this.logger.error(`Connector execution failed for DataMart ${dataMartId}:`, error);
  }

  private getSourceConfig(
    connector: DataMartConnectorDefinition['connector'],
    config: Record<string, unknown>
  ): SourceConfig {
    const fieldsConfig = connector.source.fields
      .map(field => `${connector.source.node} ${field}`)
      .join(', ');

    return new SourceConfig({
      name: connector.source.name,
      config: {
        ...config,
        Fields: fieldsConfig,
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
}
