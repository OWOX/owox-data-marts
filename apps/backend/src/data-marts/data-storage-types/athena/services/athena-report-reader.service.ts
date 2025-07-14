import { ColumnInfo } from '@aws-sdk/client-athena/dist-types/models';
import { isAthenaDataMartSchema } from '../../data-mart-schema.guards';
import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { Report } from '../../../entities/report.entity';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorage } from '../../../entities/data-storage.entity';
import { AthenaApiAdapter } from '../adapters/athena-api.adapter';
import { AthenaApiAdapterFactory } from '../adapters/athena-api-adapter.factory';
import { S3ApiAdapter } from '../adapters/s3-api.adapter';
import { S3ApiAdapterFactory } from '../adapters/s3-api-adapter.factory';
import { isAthenaCredentials } from '../../data-storage-credentials.guards';
import { isAthenaConfig } from '../../data-storage-config.guards';
import { AthenaDataMartSchema } from '../schemas/athena-data-mart-schema.schema';
import { AthenaQueryBuilder } from './athena-query.builder';

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
    private readonly s3AdapterFactory: S3ApiAdapterFactory,
    private readonly athenaQueryBuilder: AthenaQueryBuilder
  ) {}

  async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition, schema } = report.dataMart;
    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (schema && !isAthenaDataMartSchema(schema)) {
      throw new Error('Athena data mart schema is expected');
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

    const dataHeaders = this.getDataHeaders(metadata.ColumnInfo, schema);

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
      const query = this.athenaQueryBuilder.buildQuery(dataMartDefinition);
      await this.executeQuery(query);
    } catch (error) {
      this.logger.error('Failed to prepare query execution', error);
      throw error;
    }
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

  private getDataHeaders(
    athenaColumns: ColumnInfo[],
    dataMartSchema?: AthenaDataMartSchema
  ): string[] {
    return athenaColumns.map(col => {
      const columnName = col.Name || '';
      if (dataMartSchema) {
        const schemaField = dataMartSchema.fields.find(field => field.name === columnName);
        return schemaField?.alias || columnName;
      }
      return columnName;
    });
  }
}
