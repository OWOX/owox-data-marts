import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
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
  GetDataResponse,
  RequestField,
} from '../schemas/get-data.schema';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';

/**
 * Maximum number of rows that can be returned in a single getData request.
 * Looker Studio has a hard limit of 1 million rows per request.
 * @see https://developers.google.com/looker-studio/connector/reference#getdata
 */
const MAX_ROWS_LIMIT = 1_000_000;

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
 * Smaller batches reduce peak memory during streaming.
 */
const STREAMING_BATCH_SIZE = 1000;

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
  ): Promise<GetDataResponse> {
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
      throw new BusinessViolationException('No valid fields found in the request');
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
  ): Promise<GetDataResponse> {
    // Build schema for requested fields only
    const schema = this.buildResponseSchema(filteredHeaders, report.dataMart.storage.type);

    // Read and process data (prepareReportData already called in cache service)
    const rows = await this.readAndProcessData(reader, fieldIndexMap, rowLimit);

    return {
      schema,
      rows,
      filtersApplied: [],
    };
  }

  /**
   * Builds the response schema from filtered headers
   */
  private buildResponseSchema(
    filteredHeaders: ReportDataHeader[],
    storageType: DataStorageType
  ): Array<{ name: string; dataType: FieldDataType }> {
    return filteredHeaders.map(header => ({
      name: header.name,
      dataType: this.typeMapperService.mapToLookerStudioDataType(
        header.storageFieldType!,
        storageType
      ),
    }));
  }

  /**
   * Reads data in batches and processes it
   */
  private async readAndProcessData(
    reportReader: DataStorageReportReader,
    fieldIndexMap: number[],
    rowLimit?: number
  ): Promise<{ values: FieldValue[] }[]> {
    const allRows: { values: FieldValue[] }[] = [];
    let nextBatchId: string | undefined | null = undefined;

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
        const limitType = rowLimit < MAX_ROWS_LIMIT ? 'sample extraction' : 'full extraction';
        this.logger.warn(
          `Row limit reached (${limitType}): returning ${rowLimit} rows (more data available)`
        );
        return allRows.slice(0, rowLimit);
      }
    } while (nextBatchId);

    return allRows;
  }

  /**
   * Extracts requested field names, excluding fields marked for filtering only
   */
  private getRequestedFieldNames(fields: RequestField[]): string[] {
    return fields.filter(field => !field.forFilterOnly).map(field => field.name);
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
   * Memory optimization: Only one batch (~1000 rows) is held in memory at a time,
   * compared to accumulating all rows (up to 1M) before sending.
   *
   * @param res - Express response object
   * @param context - Pre-computed streaming context
   * @returns Total number of rows streamed
   */
  public async streamData(res: Response, context: StreamingContext): Promise<number> {
    const { schema, reader, fieldIndexMap, rowLimit } = context;

    // Set headers for JSON streaming
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');

    // Write opening JSON structure with schema
    res.write(`{"schema":${JSON.stringify(schema)},"rows":[`);

    let totalRows = 0;
    let isFirstRow = true;
    let nextBatchId: string | undefined | null = undefined;

    do {
      const remainingRows = rowLimit - totalRows;
      const batchSize = Math.min(STREAMING_BATCH_SIZE, remainingRows);

      const batch = await reader.readReportDataBatch(nextBatchId, batchSize);

      // Stream each row
      for (const row of batch.dataRows) {
        if (totalRows >= rowLimit) break;

        const formattedRow: DataRow = {
          values: fieldIndexMap.map(index => this.convertToFieldValue(row[index])),
        };

        // Write comma separator (except for first row)
        if (!isFirstRow) {
          res.write(',');
        }
        isFirstRow = false;

        res.write(JSON.stringify(formattedRow));
        totalRows++;
      }

      nextBatchId = batch.nextDataBatchId;

      // Check if we've reached the row limit
      if (totalRows >= rowLimit) {
        if (nextBatchId) {
          this.logger.warn(
            `Row limit reached during streaming: returned ${totalRows} rows (more data available)`
          );
        }
        break;
      }
    } while (nextBatchId);

    // Write closing JSON structure
    res.write(`],"filtersApplied":[]}`);
    res.end();

    this.logger.log(`Streaming completed: ${totalRows} rows sent`);
    return totalRows;
  }
}
