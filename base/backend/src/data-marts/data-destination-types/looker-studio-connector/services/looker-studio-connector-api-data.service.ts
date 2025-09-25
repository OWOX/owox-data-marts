import { Injectable, Logger } from '@nestjs/common';
import { BusinessViolationException } from '../../../../common/exceptions/business-violation.exception';
import { DataStorageType } from '../../../data-storage-types/enums/data-storage-type.enum';
import { DataStorageReportReader } from '../../../data-storage-types/interfaces/data-storage-report-reader.interface';
import { CachedReaderData } from '../../../dto/domain/cached-reader-data.dto';
import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { Report } from '../../../entities/report.entity';
import { FieldDataType } from '../enums/field-data-type.enum';
import {
  FieldValue,
  GetDataRequest,
  GetDataResponse,
  RequestField,
} from '../schemas/get-data.schema';
import { LookerStudioTypeMapperService } from './looker-studio-type-mapper.service';

interface HeadersAndMapping {
  filteredHeaders: ReportDataHeader[];
  fieldIndexMap: number[];
}

@Injectable()
export class LookerStudioConnectorApiDataService {
  private readonly logger = new Logger(LookerStudioConnectorApiDataService.name);

  constructor(private readonly typeMapperService: LookerStudioTypeMapperService) {}

  public async getData(
    request: GetDataRequest,
    report: Report,
    cachedReader: CachedReaderData,
    isSampleExtraction: boolean
  ): Promise<GetDataResponse> {
    this.logger.log('getData called with request:', request);
    this.logger.debug(`Using ${cachedReader.fromCache ? 'cached' : 'fresh'} reader for data`);

    // Prepare headers and field mapping using cached data
    const { filteredHeaders, fieldIndexMap } = await this.prepareHeadersAndMapping(
      cachedReader.dataDescription.dataHeaders,
      request.request.fields
    );

    // Determine effective row limit: 100 if sample extraction, otherwise no limits
    const effectiveRowLimit = isSampleExtraction ? 100 : undefined;

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
}
