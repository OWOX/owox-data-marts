import { Injectable, Logger, Scope } from '@nestjs/common';
import { DataStorageType } from '../../enums/data-storage-type.enum';
import { DataStorageReportReader } from '../../interfaces/data-storage-report-reader.interface';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { DataMartDefinition } from '../../../dto/schemas/data-mart-table-definitions/data-mart-definition';
import { DataStorageReportReaderState } from '../../interfaces/data-storage-report-reader-state.interface';
import { DataStorage } from '../../../entities/data-storage.entity';
import { DatabricksApiAdapter } from '../adapters/databricks-api.adapter';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
import { isDatabricksCredentials } from '../../data-storage-credentials.guards';
import { isDatabricksConfig } from '../../data-storage-config.guards';
import { DatabricksQueryBuilder } from './databricks-query.builder';
import { DatabricksReportHeadersGenerator } from './databricks-report-headers-generator.service';
import { isDatabricksDataMartSchema } from '../../data-mart-schema.guards';
import {
  DatabricksReaderState,
  isDatabricksReaderState,
} from '../interfaces/databricks-reader-state.interface';

@Injectable({ scope: Scope.TRANSIENT })
export class DatabricksReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(DatabricksReportReader.name);
  readonly type = DataStorageType.DATABRICKS;

  private adapter: DatabricksApiAdapter;
  private reportDataHeaders: ReportDataHeader[];
  private reportConfig: { storage: DataStorage; definition: DataMartDefinition };
  private queryId?: string;
  private currentRowIndex = 0;
  private allRows: Record<string, unknown>[] = [];

  constructor(
    private readonly adapterFactory: DatabricksApiAdapterFactory,
    private readonly queryBuilder: DatabricksQueryBuilder,
    private readonly headersGenerator: DatabricksReportHeadersGenerator
  ) {}

  async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition, schema } = report.dataMart;
    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (!schema) {
      throw new Error('Databricks data mart schema is required for header generation');
    }

    if (!isDatabricksDataMartSchema(schema)) {
      throw new Error('Databricks data mart schema is expected');
    }

    this.reportConfig = { storage, definition };
    this.reportDataHeaders = this.headersGenerator.generateHeaders(schema);

    await this.prepareApiAdapter(this.reportConfig.storage);

    const query = this.queryBuilder.buildQuery(definition);
    this.logger.debug(`Executing query: ${query}`);

    const result = await this.adapter.executeQuery(query);
    this.queryId = result.queryId;
    this.allRows = result.rows || [];
    this.currentRowIndex = 0;

    this.logger.debug(
      `Query executed, queryId: ${this.queryId}, total rows: ${this.allRows.length}`
    );

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(_batchId?: string, maxDataRows = 1000): Promise<ReportDataBatch> {
    if (!this.reportDataHeaders || !this.queryId) {
      throw new Error('Report data must be prepared before read');
    }

    const startIndex = this.currentRowIndex;
    const endIndex = Math.min(startIndex + maxDataRows, this.allRows.length);
    const rows = this.allRows.slice(startIndex, endIndex);

    const mappedRows = this.mapRowsToHeaders(rows);

    this.currentRowIndex = endIndex;
    const hasMoreData = endIndex < this.allRows.length;
    const nextBatchId = hasMoreData ? this.currentRowIndex.toString() : null;

    this.logger.debug(
      `Returning batch with ${rows.length} rows (from index ${startIndex} to ${endIndex})`
    );

    return new ReportDataBatch(mappedRows, nextBatchId);
  }

  async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read');

    if (this.adapter) {
      await this.adapter.destroy();
    }

    this.allRows = [];
  }

  private async prepareApiAdapter(storage: DataStorage): Promise<void> {
    try {
      if (!isDatabricksCredentials(storage.credentials)) {
        throw new Error('Databricks credentials are not properly configured');
      }

      if (!isDatabricksConfig(storage.config)) {
        throw new Error('Databricks config is not properly configured');
      }

      this.adapter = this.adapterFactory.create(storage.credentials, storage.config);

      this.logger.debug('Databricks adapter created successfully');
    } catch (error) {
      this.logger.error('Failed to create adapter', error);
      throw error;
    }
  }

  private mapRowsToHeaders(rows: Record<string, unknown>[]): unknown[][] {
    const headerNames = this.reportDataHeaders.map(h => h.name);

    return rows.map(row => {
      return headerNames.map(headerName => {
        let value: unknown;

        // Try exact match first
        if (headerName in row) {
          value = row[headerName];
        } else {
          // Try lowercase match (Databricks may lowercase column names)
          const lowerHeaderName = headerName.toLowerCase();
          if (lowerHeaderName in row) {
            value = row[lowerHeaderName];
          } else {
            // Column not found
            this.logger.warn(`Column '${headerName}' not found in query results`);
            return null;
          }
        }

        return this.serializeValue(value);
      });
    });
  }

  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    // Plain primitive types
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // Date
    if (value instanceof Date) {
      return value;
    }

    // Buffer to base64
    if (value instanceof Buffer) {
      return value.toString('base64');
    }

    // Objects and arrays
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        try {
          return JSON.stringify(value.map(item => this.serializeValue(item)));
        } catch (error) {
          this.logger.warn('Failed to serialize array value to JSON', error);
          return String(value);
        }
      }

      // Databricks SDK wrapper with value property
      if ('value' in value && value.value !== undefined) {
        return this.serializeValue(value.value);
      }

      // Plain objects to JSON
      try {
        return JSON.stringify(value);
      } catch (error) {
        this.logger.warn('Failed to serialize object value to JSON', error);
        return String(value);
      }
    }

    return value;
  }

  getState(): DatabricksReaderState | null {
    if (!this.queryId) {
      return null;
    }

    return {
      type: DataStorageType.DATABRICKS,
      queryId: this.queryId,
      rowsRead: this.currentRowIndex,
      hasMore: this.currentRowIndex < this.allRows.length,
    };
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (!isDatabricksReaderState(state)) {
      throw new Error('Invalid state type for Databricks reader');
    }

    this.queryId = state.queryId;
    this.currentRowIndex = state.rowsRead;
    this.reportDataHeaders = reportDataHeaders;

    this.logger.debug(
      `Restored from state: queryId=${this.queryId}, currentRow=${this.currentRowIndex}`
    );
  }
}
