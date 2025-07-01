import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { Report } from '../../../entities/report.entity';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import {
  isSqlDefinition,
  isTableDefinition,
  isTablePatternDefinition,
  isViewDefinition,
  isConnectorDefinition,
} from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition.guards';
import { SqlDefinition } from '../../../dto/schemas/data-mart-table-definitions/sql-definition.schema';
import { ViewDefinition } from '../../../dto/schemas/data-mart-table-definitions/view-definition.schema';
import { TableDefinition } from '../../../dto/schemas/data-mart-table-definitions/table-definition.schema';
import { DataStorage } from '../../../entities/data-storage.entity';
import { AthenaApiAdapter } from '../adapters/athena-api.adapter';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { S3ApiAdapter } from '../adapters/s3-api.adapter';
import { S3ApiAdapterFactory } from '../adapters/s3-api-adapter.factory';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { ConnectorDefinition } from 'src/data-marts/dto/schemas/data-mart-table-definitions/connector-definition.schema';

@Injectable({ scope: Scope.TRANSIENT })
export class AthenaReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(AthenaReportReader.name);
  readonly type = DataStorageType.AWS_ATHENA;

  private athenaAdapter: AthenaApiAdapter;
  private s3Adapter: S3ApiAdapter;
  private queryExecutionId?: string;
  private outputBucket: string;
  private outputPrefix: string;
  private databaseName: string;

  constructor(
    private readonly athenaAdapterFactory: AthenaApiAdapterFactory,
    private readonly s3AdapterFactory: S3ApiAdapterFactory
  ) {}

  async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition } = report.dataMart;
    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    await this.prepareApiAdapters(storage);
    await this.prepareQueryExecution(definition);

    if (!this.queryExecutionId) {
      throw new Error('Query execution ID not set');
    }

    await this.athenaAdapter.waitForQueryToComplete(this.queryExecutionId);

    // Get query results metadata
    const metadata = await this.athenaAdapter.getQueryResultsMetadata(this.queryExecutionId);
    if (!metadata.ColumnInfo) {
      throw new Error('Failed to get query results metadata');
    }

    const dataHeaders = metadata.ColumnInfo.map(col => col.Name || '');

    return new ReportDataDescription(dataHeaders);
  }

  async readReportDataBatch(batchId?: string, maxDataRows = 1000): Promise<ReportDataBatch> {
    if (!this.athenaAdapter) {
      throw new Error('Report data must be prepared before read');
    }

    if (!this.queryExecutionId) {
      throw new Error('Query execution ID not set');
    }

    const results = await this.athenaAdapter.getQueryResults(
      this.queryExecutionId,
      batchId,
      maxDataRows
    );

    if (!results.ResultSet || !results.ResultSet.Rows) {
      throw new Error('Failed to get query results');
    }

    // Skip the header row if this is the first batch
    const startIndex = !batchId ? 1 : 0;
    const rows = results.ResultSet.Rows.slice(startIndex);

    // Map rows to the expected format
    const mappedRows = rows.map(row => {
      if (!row.Data) return [];
      return row.Data.map(cell => cell.VarCharValue);
    });

    return new ReportDataBatch(mappedRows, results.NextToken);
  }

  async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read');

    if (!this.s3Adapter) {
      this.logger.debug('No S3 adapter to clean up');
      return;
    }

    if (!this.outputBucket || !this.outputPrefix) {
      this.logger.debug('No output location to clean up');
      return;
    }

    try {
      await this.s3Adapter.cleanupOutputFiles(this.outputBucket, this.outputPrefix);
    } catch (error) {
      this.logger.error('Error cleaning up query results', error);
      throw error;
    }
  }

  private async prepareApiAdapters(storage: DataStorage): Promise<void> {
    try {
      if (!isAthenaCredentials(storage.credentials)) {
        throw new Error('Athena credentials are not properly configured');
      }

      if (!isAthenaConfig(storage.config)) {
        throw new Error('Athena config is not properly configured');
      }

      this.athenaAdapter = this.athenaAdapterFactory.create(storage.credentials, storage.config);
      this.s3Adapter = this.s3AdapterFactory.create(storage.credentials, storage.config);

      this.outputBucket = storage.config.outputBucket;
      this.databaseName = storage.config.databaseName;

      this.logger.debug('Athena and S3 adapters created successfully');
    } catch (error) {
      this.logger.error('Failed to create adapters', error);
      throw error;
    }
  }

  private async prepareQueryExecution(dataMartDefinition: DataMartDefinition): Promise<void> {
    this.logger.debug('Preparing query execution', dataMartDefinition);
    try {
      if (isTableDefinition(dataMartDefinition)) {
        await this.prepareTableData(dataMartDefinition);
      } else if (isSqlDefinition(dataMartDefinition)) {
        await this.prepareSqlData(dataMartDefinition);
      } else if (isViewDefinition(dataMartDefinition)) {
        await this.prepareViewData(dataMartDefinition);
      } else if (isTablePatternDefinition(dataMartDefinition)) {
        throw new Error('Table pattern queries are not supported in Athena');
      } else if (isConnectorDefinition(dataMartDefinition)) {
        await this.prepareConnectorData(dataMartDefinition);
      } else {
        throw new Error('Invalid data mart definition');
      }
    } catch (error) {
      this.logger.error('Failed to prepare query execution', error);
      throw error;
    }
  }

  private async prepareSqlData(dataMartDefinition: SqlDefinition): Promise<void> {
    await this.executeQuery(dataMartDefinition.sqlQuery);
  }

  private async prepareViewData(dataMartDefinition: ViewDefinition): Promise<void> {
    await this.executeQuery(`SELECT * FROM ${dataMartDefinition.fullyQualifiedName}`);
  }

  private async prepareTableData(dataMartDefinition: TableDefinition): Promise<void> {
    await this.executeQuery(`SELECT * FROM ${dataMartDefinition.fullyQualifiedName}`);
  }

  private async prepareConnectorData(dataMartDefinition: ConnectorDefinition): Promise<void> {
    await this.executeQuery(
      `SELECT * FROM ${dataMartDefinition.connector.storage.fullyQualifiedName}`
    );
  }

  private async executeQuery(query: string): Promise<void> {
    // Generate a unique output location prefix
    this.outputPrefix = `owox-data-marts/${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    const result = await this.athenaAdapter.executeQuery(
      query,
      this.databaseName,
      this.outputBucket,
      this.outputPrefix
    );

    this.queryExecutionId = result.queryExecutionId;
  }
}
