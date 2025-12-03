import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { Report } from '../../../entities/report.entity';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import { RedshiftApiAdapterFactory } from '../adapters/redshift-api-adapter.factory';
import { RedshiftApiAdapter } from '../adapters/redshift-api.adapter';
import { RedshiftQueryBuilder } from './redshift-query.builder';
import { RedshiftReportHeadersGenerator } from './redshift-report-headers-generator.service';
import { isRedshiftCredentials } from '../../data-storage-credentials.guards';
import { isRedshiftConfig } from '../../data-storage-config.guards';
import { isRedshiftDataMartSchema } from '../../data-mart-schema.guards';
import { RedshiftReaderState } from '../interfaces/redshift-reader-state.interface';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorage } from '../../../entities/data-storage.entity';

@Injectable({ scope: Scope.TRANSIENT })
export class RedshiftReportReader implements DataStorageReportReader {
  readonly type = DataStorageType.AWS_REDSHIFT;
  private readonly logger = new Logger(RedshiftReportReader.name);

  private adapter?: RedshiftApiAdapter;
  private statementId?: string;
  private reportDataHeaders: ReportDataHeader[] = [];
  private reportConfig?: {
    storage: DataStorage;
    definition: DataMartDefinition;
  };

  constructor(
    private readonly adapterFactory: RedshiftApiAdapterFactory,
    private readonly queryBuilder: RedshiftQueryBuilder,
    private readonly headersGenerator: RedshiftReportHeadersGenerator
  ) {}

  async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition, schema } = report.dataMart;

    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (!schema || !isRedshiftDataMartSchema(schema)) {
      throw new Error('Redshift data mart schema is required');
    }

    this.reportConfig = { storage, definition };
    this.reportDataHeaders = this.headersGenerator.generateHeaders(schema);

    if (!isRedshiftCredentials(storage.credentials)) {
      throw new Error('Redshift credentials are not properly configured');
    }

    if (!isRedshiftConfig(storage.config)) {
      throw new Error('Redshift config is not properly configured');
    }

    this.adapter = this.adapterFactory.create(storage.credentials, storage.config);

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(batchId?: string, _maxDataRows = 1000): Promise<ReportDataBatch> {
    // Initialize query on first request
    if (!this.statementId) {
      await this.initializeReportData();
    }

    if (!this.adapter || !this.statementId) {
      throw new Error('Report data must be prepared before read');
    }

    const results = await this.adapter.getQueryResults(this.statementId, batchId);

    if (!results.Records) {
      throw new Error('Failed to get query results');
    }

    // Map Redshift Field values to row arrays
    const rows = results.Records.map(record => {
      return record.map(field => {
        // Extract value from Field union type
        if (field.stringValue !== undefined) return field.stringValue;
        if (field.longValue !== undefined) return field.longValue;
        if (field.doubleValue !== undefined) return field.doubleValue;
        if (field.booleanValue !== undefined) return field.booleanValue;
        if (field.isNull) return null;
        return null;
      });
    });

    return new ReportDataBatch(rows, results.NextToken);
  }

  async finalize(): Promise<void> {
    // No cleanup needed for Redshift Data API
    this.logger.debug('Finalizing report read (no cleanup required)');
  }

  private async initializeReportData(): Promise<void> {
    if (!this.reportConfig) {
      throw new Error('Report config not set');
    }

    if (!this.adapter) {
      throw new Error('Adapter not initialized');
    }

    const query = this.queryBuilder.buildQuery(this.reportConfig.definition);

    const { statementId } = await this.adapter.executeQuery(query);
    this.statementId = statementId;

    await this.adapter.waitForQueryToComplete(statementId);
  }

  getState(): DataStorageReportReaderState | null {
    if (!this.statementId) return null;

    const state: RedshiftReaderState = {
      type: DataStorageType.AWS_REDSHIFT,
      statementId: this.statementId,
    };

    return state;
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (state.type !== DataStorageType.AWS_REDSHIFT) {
      throw new Error('Invalid state type for Redshift reader');
    }

    const redshiftState = state as RedshiftReaderState;
    this.statementId = redshiftState.statementId;
    this.reportDataHeaders = reportDataHeaders;
  }
}
