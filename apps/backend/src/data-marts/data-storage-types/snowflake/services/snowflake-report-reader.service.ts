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
import { isSnowflakeCredentials } from '../../data-storage-credentials.guards';
import { isSnowflakeConfig } from '../../data-storage-config.guards';
import { SnowflakeQueryBuilder } from './snowflake-query.builder';
import { SnowflakeReportHeadersGenerator } from './snowflake-report-headers-generator.service';
import { isSnowflakeDataMartSchema } from '../../data-mart-schema.guards';

@Injectable({ scope: Scope.TRANSIENT })
export class SnowflakeReportReader implements DataStorageReportReader {
  private readonly logger = new Logger(SnowflakeReportReader.name);
  readonly type = DataStorageType.SNOWFLAKE;

  private adapter: SnowflakeApiAdapter;
  private reportDataHeaders: ReportDataHeader[];
  private reportConfig: { storage: DataStorage; definition: DataMartDefinition };
  private allRows: unknown[][] = [];
  private currentBatchIndex = 0;

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

    await this.prepareApiAdapter(this.reportConfig.storage);

    // Execute query and fetch all data
    const query = this.queryBuilder.buildQuery(definition);
    this.logger.debug(`Executing query: ${query}`);

    const result = await this.adapter.executeQuery(query);

    if (!result.rows) {
      this.allRows = [];
    } else {
      // Map rows to match header order
      this.allRows = this.mapRowsToHeaders(result.rows);
    }

    this.logger.debug(`Query returned ${this.allRows.length} rows`);

    return new ReportDataDescription(this.reportDataHeaders);
  }

  async readReportDataBatch(_batchId?: string, maxDataRows = 1000): Promise<ReportDataBatch> {
    if (!this.reportDataHeaders) {
      throw new Error('Report data must be prepared before read');
    }

    const startIndex = this.currentBatchIndex;
    const endIndex = Math.min(startIndex + maxDataRows, this.allRows.length);

    const batchRows = this.allRows.slice(startIndex, endIndex);
    this.currentBatchIndex = endIndex;

    const hasMoreData = endIndex < this.allRows.length;
    const nextBatchId = hasMoreData ? endIndex.toString() : null;

    this.logger.debug(
      `Returning batch with ${batchRows.length} rows (${startIndex}-${endIndex} of ${this.allRows.length})`
    );

    return new ReportDataBatch(batchRows, nextBatchId);
  }

  async finalize(): Promise<void> {
    this.logger.debug('Finalizing report read');

    if (this.adapter) {
      await this.adapter.destroy();
    }
  }

  private async prepareApiAdapter(storage: DataStorage): Promise<void> {
    try {
      if (!isSnowflakeCredentials(storage.credentials)) {
        throw new Error('Snowflake credentials are not properly configured');
      }

      if (!isSnowflakeConfig(storage.config)) {
        throw new Error('Snowflake config is not properly configured');
      }

      this.adapter = this.adapterFactory.create(storage.credentials, storage.config);

      this.logger.debug('Snowflake adapter created successfully');
    } catch (error) {
      this.logger.error('Failed to create adapter', error);
      throw error;
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

  getState(): DataStorageReportReaderState | null {
    // Snowflake doesn't need state management as we fetch all data at once
    return null;
  }

  async initFromState(
    _state: DataStorageReportReaderState,
    _reportDataHeaders: ReportDataHeader[]
  ): Promise<void> {
    // Not implemented for Snowflake
    throw new Error('State management is not supported for Snowflake reader');
  }
}
