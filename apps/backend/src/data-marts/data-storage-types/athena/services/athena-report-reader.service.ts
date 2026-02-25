import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { isAthenaDataMartSchema } from '../../data-mart-schema.guards';
import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import {
  AthenaReaderState,
  isAthenaReaderState,
} from '../interfaces/athena-reader-state.interface';
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
import { AthenaQueryBuilder } from './athena-query.builder';
import { AthenaReportHeadersGenerator } from './athena-report-headers-generator.service';
import { DataStorageCredentialsResolver } from '../../data-storage-credentials-resolver.service';

@Injectable({ scope: Scope.TRANSIENT })
export class AthenaReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(AthenaReportReader.name);
  readonly type = DataStorageType.AWS_ATHENA;

  private athenaAdapter: AthenaApiAdapter;
  private s3Adapter: S3ApiAdapter;
  private queryExecutionId?: string;
  private outputBucket: string;
  private outputPrefix: string;
  private reportDataHeaders: ReportDataHeader[];
  private reportConfig: { storage: DataStorage; definition: DataMartDefinition };

  constructor(
    private readonly athenaAdapterFactory: AthenaApiAdapterFactory,
    private readonly s3AdapterFactory: S3ApiAdapterFactory,
    private readonly athenaQueryBuilder: AthenaQueryBuilder,
    private readonly headersGenerator: AthenaReportHeadersGenerator,
    private readonly credentialsResolver: DataStorageCredentialsResolver
  ) {}

  async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition, schema } = report.dataMart;
    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (!schema) {
      throw new Error('Athena data mart schema is required for header generation');
    }

    if (!isAthenaDataMartSchema(schema)) {
      throw new Error('Athena data mart schema is expected');
    }

    this.reportConfig = { storage, definition };

    this.reportDataHeaders = this.headersGenerator.generateHeaders(schema);

    const resolvedCredentials = await this.credentialsResolver.resolve(storage);
    await this.prepareApiAdapters(storage, resolvedCredentials);

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(batchId?: string, maxDataRows = 1000): Promise<ReportDataBatch> {
    // Initialize on first request
    if (!this.queryExecutionId) {
      await this.initializeReportData();
    }

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

    const columnInfo = results.ResultSet.ResultSetMetadata?.ColumnInfo;
    if (!columnInfo) {
      throw new Error('Column metadata is not available');
    }

    // Create mapping from expected header order to actual column positions
    const columnMapping: number[] = [];
    for (const header of this.reportDataHeaders) {
      const columnIndex = columnInfo.findIndex(col => col.Name === header.name);
      if (columnIndex === -1) {
        throw new Error(`Column '${header.name}' not found in query results`);
      }
      columnMapping.push(columnIndex);
    }

    const mappedRows = rows.map(row => {
      if (!row.Data) return [];
      const reorderedData: unknown[] = [];
      for (const columnIndex of columnMapping) {
        reorderedData.push(row.Data[columnIndex]?.VarCharValue);
      }
      return reorderedData;
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

  private async initializeReportData(): Promise<void> {
    if (!this.reportConfig) {
      throw new Error('Report data must be prepared before read');
    }

    await this.prepareQueryExecution(this.reportConfig.definition);

    if (!this.queryExecutionId) {
      throw new Error('Query execution ID not set');
    }

    await this.athenaAdapter.waitForQueryToComplete(this.queryExecutionId);
  }

  private async prepareApiAdapters(storage: DataStorage, credentials: unknown): Promise<void> {
    try {
      if (!isAthenaCredentials(credentials)) {
        throw new Error('Athena credentials are not properly configured');
      }

      if (!isAthenaConfig(storage.config)) {
        throw new Error('Athena config is not properly configured');
      }

      this.athenaAdapter = this.athenaAdapterFactory.create(credentials, storage.config);
      this.s3Adapter = this.s3AdapterFactory.create(credentials, storage.config);
      this.outputBucket = storage.config.outputBucket;

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
      this.outputBucket,
      this.outputPrefix
    );

    this.queryExecutionId = result.queryExecutionId;
  }

  getState(): AthenaReaderState | null {
    if (!this.outputBucket || !this.outputPrefix) {
      return null;
    }

    return {
      type: DataStorageType.AWS_ATHENA,
      queryExecutionId: this.queryExecutionId,
      outputBucket: this.outputBucket,
      outputPrefix: this.outputPrefix,
    };
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (!isAthenaReaderState(state)) {
      throw new Error('Invalid state type for Athena reader');
    }

    this.queryExecutionId = state.queryExecutionId;
    this.outputBucket = state.outputBucket;
    this.outputPrefix = state.outputPrefix;
    this.reportDataHeaders = reportDataHeaders;
  }
}
