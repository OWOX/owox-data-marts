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
import { SnowflakeApiAdapter } from '../adapters/snowflake-api.adapter';
import { SnowflakeApiAdapterFactory } from '../adapters/snowflake-api-adapter.factory';
import { SnowflakeQueryBuilder } from './snowflake-query.builder';
import { SnowflakeReportHeadersGenerator } from './snowflake-report-headers-generator.service';
import { isSnowflakeDataMartSchema } from '../../data-mart-schema.guards';
import {
  SnowflakeReaderState,
  isSnowflakeReaderState,
} from '../interfaces/snowflake-reader-state.interface';
@Injectable({ scope: Scope.TRANSIENT })
export class SnowflakeReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(SnowflakeReportReader.name);
  readonly type = DataStorageType.SNOWFLAKE;

  private adapter: SnowflakeApiAdapter;
  private reportDataHeaders: ReportDataHeader[];
  private reportConfig: { storage: DataStorage; definition: DataMartDefinition };
  private queryId?: string;
  private currentRowIndex = 0;

  constructor(
    private readonly adapterFactory: SnowflakeApiAdapterFactory,
    private readonly queryBuilder: SnowflakeQueryBuilder,
    private readonly headersGenerator: SnowflakeReportHeadersGenerator
  ) {}

  async prepareReportData(report: Report): Promise<ReportDataDescription> {
    const { storage, definition, schema } = report.dataMart;
    if (!storage || !definition) {
      throw new Error('Data Mart is not properly configured');
    }

    if (!schema) {
      throw new Error('Snowflake data mart schema is required for header generation');
    }

    if (!isSnowflakeDataMartSchema(schema)) {
      throw new Error('Snowflake data mart schema is expected');
    }

    this.reportConfig = { storage, definition };
    this.reportDataHeaders = this.headersGenerator.generateHeaders(schema);

    this.adapter = await this.adapterFactory.createFromStorage(storage);

    const query = this.queryBuilder.buildQuery(definition);
    this.logger.debug(`Executing query: ${query}`);

    const result = await this.adapter.executeQuery(query);
    this.queryId = result.queryId;
    this.currentRowIndex = 0;

    this.logger.debug(`Query executed, queryId: ${this.queryId}`);

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(_batchId?: string, maxDataRows = 1000): Promise<ReportDataBatch> {
    if (!this.reportDataHeaders || !this.queryId) {
      throw new Error('Report data must be prepared before read');
    }

    const rows = await this.adapter.fetchResultsByQueryId(
      this.queryId,
      this.currentRowIndex,
      maxDataRows
    );

    const mappedRows = this.mapRowsToHeaders(rows);

    this.currentRowIndex += rows.length;
    const hasMoreData = rows.length === maxDataRows;
    const nextBatchId = hasMoreData ? this.currentRowIndex.toString() : null;

    this.logger.debug(
      `Returning batch with ${rows.length} rows (from index ${this.currentRowIndex - rows.length})`
    );

    return new ReportDataBatch(mappedRows, nextBatchId);
  }

  async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read');

    if (this.adapter) {
      await this.adapter.destroy();
    }
  }

  private mapRowsToHeaders(rows: Record<string, unknown>[]): unknown[][] {
    // Create mapping from header names to ensure correct column order
    const headerNames = this.reportDataHeaders.map(h => h.name);

    return rows.map(row => {
      return headerNames.map(headerName => {
        let value: unknown;

        // Try exact match first
        if (headerName in row) {
          value = row[headerName];
        } else {
          // Try case-insensitive match (Snowflake uppercases column names by default)
          const upperHeaderName = headerName.toUpperCase();
          if (upperHeaderName in row) {
            value = row[upperHeaderName];
          } else {
            // Column not found
            this.logger.warn(`Column '${headerName}' not found in query results`);
            return null;
          }
        }

        // Serialize complex objects to JSON strings for Google Sheets compatibility
        return this.serializeValue(value);
      });
    });
  }

  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    // If it's a plain primitive type, return as is
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // If it's a Date, return as is (will be formatted later)
    if (value instanceof Date) {
      return value;
    }

    // If it's a Buffer, convert to base64
    if (value instanceof Buffer) {
      return value.toString('base64');
    }

    // For objects and arrays (like VARIANT, OBJECT, ARRAY types from Snowflake),
    // serialize to JSON string
    if (typeof value === 'object') {
      // Check if it's an Array
      if (Array.isArray(value)) {
        try {
          return JSON.stringify(value.map(item => this.serializeValue(item)));
        } catch (error) {
          this.logger.warn('Failed to serialize array value to JSON', error);
          return String(value);
        }
      }

      // Check if object has a 'value' property (Snowflake SDK wrapper)
      if ('value' in value && value.value !== undefined) {
        return this.serializeValue(value.value);
      }

      // For plain objects, serialize to JSON
      try {
        return JSON.stringify(value);
      } catch (error) {
        this.logger.warn('Failed to serialize object value to JSON', error);
        return String(value);
      }
    }

    return value;
  }

  getState(): SnowflakeReaderState | null {
    if (!this.queryId) {
      return null;
    }

    return {
      type: DataStorageType.SNOWFLAKE,
      queryId: this.queryId,
      currentRowIndex: this.currentRowIndex,
    };
  }

  async initFromState(
    state: DataStorageReportReaderState,
    reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    if (!isSnowflakeReaderState(state)) {
      throw new Error('Invalid state type for Snowflake reader');
    }

    this.queryId = state.queryId;
    this.currentRowIndex = state.currentRowIndex;
    this.reportDataHeaders = reportDataHeaders;

    this.logger.debug(
      `Restored from state: queryId=${this.queryId}, currentRow=${this.currentRowIndex}`
    );
  }
}
