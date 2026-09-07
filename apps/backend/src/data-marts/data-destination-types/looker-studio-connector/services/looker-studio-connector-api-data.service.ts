import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { pipeline } from 'node:stream/promises';
import * as zlib from 'zlib';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../../../data-storage-types/interfaces/data-storage-report-reader.interface';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { FieldDataType } from '../enums/field-data-type.enum';
import {
  DataRow,
  FieldValue,
  GetDataRequest,
  GetDataResult,
  RequestField,
} from '../schemas/get-data.schema';

import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';

/**
 * Maximum number of rows that can be returned in a single getData request.
 * Looker Studio has a hard limit of 1 million rows per request.
 * @see https://developers.google.com/looker-studio/connector/reference#getdata
 */
const MAX_ROWS_LIMIT = 1_000_000;

/**
 * The maximum number of bytes supported by Apps script UrlFetchApp.fetch() is 50 megabytes.
 * We use a lower limit to prevent exceeding the Apps Script quota for URL fetch operations.
 * @see https://developers.google.com/apps-script/guides/services/quotas
 */
const MAX_BYTES_LIMIT = 49 * 1024 * 1024;

interface HeadersAndMapping {
  filteredHeaders: ReportDataHeader[];
  fieldIndexMap: number[];
}

/**
 * Context for streaming data responses.
 * Contains pre-computed schema and field mapping for efficient row streaming.
 */
export interface StreamingContext {
  schema: Array<{ name: string; dataType: FieldDataType }>;
  reader: DataStorageReportReader;
  fieldIndexMap: number[];
  rowLimit: number;
}

/**
 * Batch size for streaming responses.
 * Balance between memory usage and performance:
 * - Larger batches = fewer writes = faster
 * - Smaller batches = less memory
 */
const STREAMING_BATCH_SIZE = 5000;

/**
 * Service for handling data extraction requests from Looker Studio connector.
 *
 * Responsible for:
 * - Processing getData requests from Looker Studio
 * - Mapping data storage columns to Looker Studio fields
 * - Filtering and transforming data according to requested fields
 * - Handling sample vs full data extraction
 *
 * Data flow:
 * 1. Receives request with desired fields from Looker Studio
 * 2. Maps requested fields to report data headers
 * 3. Reads data from cached/fresh reader
 * 4. Transforms data values to Looker Studio format
 * 5. Returns formatted response
 *
 * @see LookerStudioConnectorApiService - Main coordinator for Looker Studio API
 * @see LookerStudioTypeMapperService - Type conversion utilities
 */
@Injectable()
export class LookerStudioConnectorApiDataService {
  private readonly logger = new Logger(LookerStudioConnectorApiDataService.name);

  constructor(private readonly typeMapperService: LookerStudioTypeMapperService) {}

  /**
   * Processes getData request from Looker Studio.
   *
   * @param request - Looker Studio getData request with field selection
   * @param report - Report entity with data source configuration
   * @param cachedReader - Cached or fresh data reader with headers
   * @param isSampleExtraction - If true, limits response to 100 rows for preview
   * @returns Formatted data response for Looker Studio
   */
  public async getData(
    request: GetDataRequest,
    report: Report,
    cachedReader: CachedReaderData,
    isSampleExtraction = false
  ): Promise<GetDataResult> {
    this.logger.log('getData called with request:', request);
    this.logger.debug(`Using ${cachedReader.fromCache ? 'cached' : 'fresh'} reader for data`);

    // Prepare headers and field mapping using cached data
    const { filteredHeaders, fieldIndexMap } = await this.prepareHeadersAndMapping(
      cachedReader.dataDescription.dataHeaders,
      request.request.fields
    );

    // Determine effective row limit: 100 for sample extraction, MAX_ROWS_LIMIT for full extraction
    const effectiveRowLimit = isSampleExtraction ? 100 : MAX_ROWS_LIMIT;

    // Process data and build response using cached reader
    return this.processDataAndBuildResponse(
      report,
      cachedReader.reader,
      filteredHeaders,
      fieldIndexMap,
      effectiveRowLimit
    );
  }

  /**
   * Prepares headers and creates field index mapping using cached data
   */
  private async prepareHeadersAndMapping(
    allReportHeaders: ReportDataHeader[],
    requestFields: RequestField[]
  ): Promise<HeadersAndMapping> {
    // Filter headers according to requested fields
    const requestedFieldNames = this.getRequestedFieldNames(requestFields);
    const filteredHeaders = allReportHeaders.filter(header =>
      requestedFieldNames.includes(header.name)
    );

    if (filteredHeaders.length === 0) {
      // Name the fields so the error is self-diagnosing: Looker Studio persists the data-source
      // schema and keeps requesting fields by their old names, so a chart bound to a column the
      // report no longer produces lands here long after the report changed. Telling the user
      // WHICH names failed points them straight at "Refresh fields" on the data source.
      throw new BusinessViolationException(
        `None of the requested fields exist in the report output: [${requestedFieldNames.join(', ')}]. ` +
          'The report columns have likely changed — refresh the data source fields in Looker Studio.'
      );
    }

    // Create index mapping for data filtering
    const fieldIndexMap = this.createFieldIndexMap(allReportHeaders, filteredHeaders);

    return { filteredHeaders, fieldIndexMap };
  }

  /**
   * Processes data from storage and builds the response
   */
  private async processDataAndBuildResponse(
    report: Report,
    reader: DataStorageReportReader,
    filteredHeaders: ReportDataHeader[],
    fieldIndexMap: number[],
    rowLimit?: number
  ): Promise<GetDataResult> {
    // Build schema for requested fields only
    const schema = this.buildResponseSchema(filteredHeaders, report.dataMart.storage.type);

    // Read and process data (prepareReportData already called in cache service)
    const { rows, limitExceeded, limitReason } = await this.readAndProcessData(
      reader,
      fieldIndexMap,
      rowLimit
    );

    const response = {
      schema,
      rows,
      filtersApplied: [],
    };

    const bytesSent = Buffer.byteLength(JSON.stringify(response), 'utf8');

    return {
      response,
      meta: {
        limitExceeded,
        limitReason,
        rowsSent: rows.length,
        bytesSent,
      },
    };
  }

  /**
   * Builds the response schema from filtered headers
   */
  private buildResponseSchema(
    filteredHeaders: ReportDataHeader[],
    storageType: DataStorageType
  ): Array<{ name: string; dataType: FieldDataType }> {
    return filteredHeaders.map(header => {
      const field = this.typeMapperService.buildSchemaField(header, storageType);
      return { name: field.name, dataType: field.dataType };
    });
  }

  /**
   * Reads data in batches and processes it
   */
  private async readAndProcessData(
    reportReader: DataStorageReportReader,
    fieldIndexMap: number[],
    rowLimit?: number
  ): Promise<{
    rows: { values: FieldValue[] }[];
    limitExceeded: boolean;
    limitReason?: string;
  }> {
    const allRows: { values: FieldValue[] }[] = [];
    let nextBatchId: string | undefined | null = undefined;
    let limitExceeded = false;
    let limitReason: string | undefined;

    do {
      const batch = await reportReader.readReportDataBatch(nextBatchId, rowLimit);

      // Filter and format data for requested fields only
      const formattedRows = batch.dataRows.map(row => ({
        values: fieldIndexMap.map(index => this.convertToFieldValue(row[index])),
      }));

      allRows.push(...formattedRows);
      nextBatchId = batch.nextDataBatchId;

      // Check row limit if specified
      if (rowLimit && allRows.length >= rowLimit) {
        const overflowWithinBatch = batch.dataRows.length > formattedRows.length;
        const hasMoreData = Boolean(nextBatchId) || overflowWithinBatch;

        if (hasMoreData) {
          limitExceeded = true;
          limitReason = `Row limit reached (${rowLimit} rows)`;
        }

        const limitType = rowLimit < MAX_ROWS_LIMIT ? 'sample extraction' : 'full extraction';
        this.logger.warn(
          `Row limit reached (${limitType}): returning ${rowLimit} rows (more data available)`
        );
        return { rows: allRows.slice(0, rowLimit), limitExceeded, limitReason };
      }
    } while (nextBatchId);

    return { rows: allRows, limitExceeded, limitReason };
  }

  /**
   * Extracts requested field names
   */
  private getRequestedFieldNames(fields: RequestField[]): string[] {
    return fields.map(field => field.name);
  }

  /**
   * Creates index mapping for data filtering
   */
  private createFieldIndexMap(
    allHeaders: ReportDataHeader[],
    filteredHeaders: ReportDataHeader[]
  ): number[] {
    return filteredHeaders.map(filteredHeader => {
      const index = allHeaders.findIndex(header => header.name === filteredHeader.name);
      if (index === -1) {
        throw new BusinessViolationException(
          `Field ${filteredHeader.name} not found in report headers`
        );
      }
      return index;
    });
  }

  /**
   * Converts unknown value to FieldValue type
   */
  private convertToFieldValue(value: unknown): FieldValue {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    // Convert all other types to string
    return String(value);
  }

  /**
   * Prepares context for streaming data response.
   * Pre-computes schema and field mapping before streaming begins.
   *
   * @param request - Looker Studio getData request
   * @param report - Report entity
   * @param cachedReader - Cached reader data
   * @param isSampleExtraction - Whether this is a sample extraction
   * @returns Streaming context with schema and field mapping
   */
  public async prepareStreamingContext(
    request: GetDataRequest,
    report: Report,
    cachedReader: CachedReaderData,
    isSampleExtraction = false
  ): Promise<StreamingContext> {
    this.logger.log('Preparing streaming context');
    this.logger.debug(`Using ${cachedReader.fromCache ? 'cached' : 'fresh'} reader for streaming`);

    const { filteredHeaders, fieldIndexMap } = await this.prepareHeadersAndMapping(
      cachedReader.dataDescription.dataHeaders,
      request.request.fields
    );

    const schema = this.buildResponseSchema(filteredHeaders, report.dataMart.storage.type);
    const rowLimit = isSampleExtraction ? 100 : MAX_ROWS_LIMIT;

    return {
      schema,
      reader: cachedReader.reader,
      fieldIndexMap,
      rowLimit,
    };
  }

  /**
   * Streams data response directly to HTTP response.
   * Writes JSON incrementally to avoid loading all rows into memory.
   *
   * Memory optimization: Only one batch (~5000 rows) is held in memory at a time,
   * compared to accumulating all rows (up to 1M) before sending.
   *
   * Performance optimization: Entire batches are serialized and written at once
   * instead of row-by-row to reduce I/O overhead.
   *
   * @param res - Express response object
   * @param context - Pre-computed streaming context
   * @returns Streaming result with meta
   */
  public async streamData(
    res: Response,
    context: StreamingContext
  ): Promise<{
    rowCount: number;
    limitExceeded: boolean;
    limitReason?: string;
    bytesWritten: number;
  }> {
    const { schema, reader, fieldIndexMap, rowLimit } = context;
    const prefix = Buffer.from(`{"schema":${JSON.stringify(schema)},"rows":[`, 'utf8');
    const suffix = Buffer.from(`],"filtersApplied":[]}`, 'utf8');

    if (prefix.byteLength + suffix.byteLength > MAX_BYTES_LIMIT) {
      throw new BusinessViolationException(
        `Looker Studio response schema exceeds the size limit (${MAX_BYTES_LIMIT} bytes)`
      );
    }

    if (res.closed) {
      throw new Error('Streaming aborted: response closed');
    }

    const gzip = zlib.createGzip({ level: 3 });

    // Set headers for JSON streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Accel-Buffering', 'no');

    const streamCompletion = pipeline(gzip, res);
    streamCompletion.catch(() => undefined);

    let totalRows = 0;
    let bytesWritten = prefix.byteLength;
    let nextBatchId: string | undefined | null = undefined;
    let limitExceeded = false;
    let limitReason: string | undefined;

    try {
      await this.writeGzipChunk(gzip, prefix, streamCompletion);

      do {
        if (res.closed) {
          throw new Error('Streaming aborted: response closed');
        }

        const remainingRows = rowLimit - totalRows;
        const batchSize = Math.min(STREAMING_BATCH_SIZE, remainingRows);

        const batch = await reader.readReportDataBatch(nextBatchId, batchSize);
        if (res.closed) {
          throw new Error('Streaming aborted: response closed');
        }

        const rowsToWrite = Math.min(batch.dataRows.length, rowLimit - totalRows);
        const batchJson: string[] = [];

        for (let i = 0; i < rowsToWrite; i++) {
          const row: DataRow = {
            values: fieldIndexMap.map(index => this.convertToFieldValue(batch.dataRows[i][index])),
          };
          const serializedRow = `${totalRows === 0 ? '' : ','}${JSON.stringify(row)}`;
          const rowBytes = Buffer.byteLength(serializedRow, 'utf8');

          if (bytesWritten + rowBytes + suffix.byteLength > MAX_BYTES_LIMIT) {
            limitExceeded = true;
            limitReason = `Size limit reached (${MAX_BYTES_LIMIT} bytes)`;
            break;
          }

          batchJson.push(serializedRow);
          bytesWritten += rowBytes;
          totalRows += 1;
        }

        if (batchJson.length > 0) {
          await this.writeGzipChunk(
            gzip,
            Buffer.from(batchJson.join(''), 'utf8'),
            streamCompletion
          );
        }

        nextBatchId = batch.nextDataBatchId;

        if (limitExceeded) {
          this.logger.warn(
            `Size limit reached during streaming: returned ${totalRows} rows, data size: ${bytesWritten} bytes`
          );
          break;
        }

        if (totalRows >= rowLimit) {
          const hasMoreData = Boolean(nextBatchId) || batch.dataRows.length > rowsToWrite;
          if (hasMoreData) {
            const limitType = rowLimit < MAX_ROWS_LIMIT ? 'sample extraction' : 'full extraction';
            this.logger.warn(
              `Row limit reached during streaming (${limitType}): returned ${totalRows} rows (more data available)`
            );
            limitExceeded = true;
            limitReason = `Row limit reached (${rowLimit} rows)`;
          }
          break;
        }
      } while (nextBatchId);

      await this.writeGzipChunk(gzip, suffix, streamCompletion);
      bytesWritten += suffix.byteLength;
      gzip.end();
      await streamCompletion;
    } catch (error) {
      gzip.destroy();
      await streamCompletion.catch(() => undefined);
      throw error;
    }

    this.logger.log(
      `Streaming completed: ${totalRows} rows sent, data size: ${bytesWritten} bytes`
    );
    return {
      rowCount: totalRows,
      limitExceeded,
      limitReason,
      bytesWritten,
    };
  }

  private writeGzipChunk(
    gzip: zlib.Gzip,
    chunk: Buffer,
    streamCompletion: Promise<void>
  ): Promise<void> {
    return Promise.race([
      new Promise<void>((resolve, reject) => {
        gzip.write(chunk, error => (error ? reject(error) : resolve()));
      }),
      streamCompletion,
    ]);
  }
}
