import { Injectable, Logger, Scope } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
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
import type { DatabricksQueryCursor } from '../adapters/databricks-api.adapter';
import { DatabricksApiAdapterFactory } from '../adapters/databricks-api-adapter.factory';
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
  private queryCursor: DatabricksQueryCursor | null = null;
  private reportDataHeaders: ReportDataHeader[];
  private reportConfig: { storage: DataStorage; definition: DataMartDefinition };
  private queryId?: string;
  private currentRowIndex = 0;
  private hasMoreRows = false;
  private pendingRowsToSkip = 0;

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

    this.adapter = await this.adapterFactory.createFromStorage(storage);

    const query = this.queryBuilder.buildQuery(definition);
    this.logger.debug(`Executing query: ${query}`);

    this.queryCursor = await this.adapter.openQueryCursor(query);
    this.queryId = this.queryCursor.queryId;
    this.currentRowIndex = 0;
    this.pendingRowsToSkip = 0;
    this.hasMoreRows = true;

    this.logger.debug(`Query cursor opened, queryId: ${this.queryId}`);

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(_batchId?: string, maxDataRows = 1000): Promise<ReportDataBatch> {
    if (!this.reportDataHeaders || !this.queryCursor || !this.queryId) {
      throw new Error('Report data must be prepared before read');
    }

    if (this.pendingRowsToSkip > 0) {
      await this.skipPendingRows();
    }

    const rows = await this.queryCursor.fetchChunk(maxDataRows);

    const mappedRows = this.mapRowsToHeaders(rows);

    this.currentRowIndex += rows.length;
    const hasMoreData = rows.length > 0 ? await this.queryCursor.hasMoreRows() : false;
    this.hasMoreRows = hasMoreData;
    const nextBatchId = hasMoreData ? this.currentRowIndex.toString() : null;

    this.logger.debug(
      `Returning batch with ${rows.length} rows (rows read total: ${this.currentRowIndex})`
    );

    return new ReportDataBatch(mappedRows, nextBatchId);
  }

  async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read');
    let closeError: Error | null = null;

    if (this.queryCursor) {
      try {
        await this.queryCursor.close();
      } catch (error) {
        closeError = castError(error);
        this.logger.warn(
          `Failed to close Databricks cursor during finalize: ${closeError.message}`
        );
      } finally {
        this.queryCursor = null;
      }
    }

    if (this.adapter) {
      await this.adapter.destroy();
    }

    if (closeError) {
      throw closeError;
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
      hasMore: this.hasMoreRows,
    };
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (!isDatabricksReaderState(state)) {
      throw new Error('Invalid state type for Databricks reader');
    }

    if (!this.queryCursor || !this.queryId) {
      throw new Error('Report data must be prepared before state restore');
    }

    this.currentRowIndex = 0;
    this.pendingRowsToSkip = state.rowsRead;
    this.hasMoreRows = state.hasMore;
    this.reportDataHeaders = reportDataHeaders;

    this.logger.debug(
      `Restored from state: cachedQueryId=${state.queryId}, activeQueryId=${this.queryId}, rowsToSkip=${this.pendingRowsToSkip}`
    );
  }

  private async skipPendingRows(): Promise<void> {
    if (!this.queryCursor) {
      throw new Error('Report data must be prepared before skip');
    }

    while (this.pendingRowsToSkip > 0) {
      const chunkSize = Math.min(this.pendingRowsToSkip, 1000);
      const skippedRows = await this.queryCursor.fetchChunk(chunkSize);

      if (!skippedRows.length) {
        this.pendingRowsToSkip = 0;
        this.hasMoreRows = false;
        return;
      }

      this.pendingRowsToSkip -= skippedRows.length;
      this.currentRowIndex += skippedRows.length;
      this.hasMoreRows = await this.queryCursor.hasMoreRows();

      if (!this.hasMoreRows) {
        this.pendingRowsToSkip = 0;
        return;
      }
    }
  }
}
