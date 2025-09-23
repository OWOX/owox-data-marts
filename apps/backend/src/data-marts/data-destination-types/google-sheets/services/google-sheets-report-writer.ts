import { ReportDataHeader } from '../../../dto/domain/report-data-header.dto';
import { ConsumptionTrackingService } from '../../../services/consumption-tracking.service';
import { DataDestinationReportWriter } from '../../interfaces/data-destination-report-writer.interface';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { Injectable, Logger, Scope } from '@nestjs/common';
import { isGoogleSheetsDestination } from '../../data-destination-config.guards';
import { isGoogleSheetsCredentials } from '../../data-destination-credentials.guards';
import { GoogleSheetsConfig } from '../schemas/google-sheets-config.schema';
import { DateTime } from 'luxon';
import { Report } from '../../../entities/report.entity';
import { ReportDataDescription } from '../../../dto/domain/report-data-description.dto';
import { ReportDataBatch } from '../../../dto/domain/report-data-batch.dto';
import { SheetHeaderFormatter } from './sheet-formatters/sheet-header-formatter';
import { SheetMetadataFormatter } from './sheet-formatters/sheet-metadata-formatter';
import { GoogleSheetsApiAdapter } from '../adapters/google-sheets-api.adapter';
import { GoogleSheetsApiAdapterFactory } from '../adapters/google-sheets-api-adapter.factory';
import { SheetValuesFormatter } from './sheet-formatters/sheet-values-formatter';

/**
 * Service for writing report data to Google Sheets
 * Handles preparation, writing, and finalization of report data in Google Sheets
 */
@Injectable({ scope: Scope.TRANSIENT })
export class GoogleSheetsReportWriter implements DataDestinationReportWriter {
  readonly type = DataDestinationType.GOOGLE_SHEETS;

  private readonly logger = new Logger(GoogleSheetsReportWriter.name);

  private report: Report;
  private adapter: GoogleSheetsApiAdapter;

  // State for current write operation
  private destination: GoogleSheetsConfig;
  private reportDataHeaders: ReportDataHeader[];
  private spreadsheetTimeZone: string;
  private spreadsheetTitle: string;
  private sheetTitle: string;
  private dataMartTitle: string;
  private writtenRowsCount = 0;
  private availableRowsCount = 0;
  private availableColumnsCount = 0;

  constructor(
    private readonly headerFormatter: SheetHeaderFormatter,
    private readonly metadataFormatter: SheetMetadataFormatter,
    private readonly valuesFormatter: SheetValuesFormatter,
    private readonly adapterFactory: GoogleSheetsApiAdapterFactory,
    private readonly consumptionTrackingService: ConsumptionTrackingService
  ) {}

  /**
   * Prepares the Google Sheets document for writing report data
   * This method initializes the service, finds the sheet, prepares columns, clears the sheet, and writes headers
   */
  public async prepareToWriteReport(
    report: Report,
    reportDataDescription: ReportDataDescription
  ): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      await this.initializeService(report);

      await this.prepareSheetColumns(reportDataDescription.dataHeaders.length);

      if (reportDataDescription.estimatedDataRowsCount) {
        await this.ensureRowsAvailable(reportDataDescription.estimatedDataRowsCount + 1); // +1 for headers
      }

      this.reportDataHeaders = reportDataDescription.dataHeaders;

      await this.clearSheet();
      await this.writeHeaders();
    }, 'Preparing Google Sheets document for report');
  }

  /**
   * Writes a batch of report data to the sheet
   *
   * @param reportDataBatch - Batch of data to write to the sheet
   * @throws Error if writing fails
   */
  public async writeReportDataBatch(reportDataBatch: ReportDataBatch): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const rows = reportDataBatch.dataRows;
      if (!rows.length) {
        return;
      }

      await this.ensureRowsAvailable(rows.length);

      const rowToWrite = this.writtenRowsCount + 1;
      const range = `'${this.sheetTitle}'!${rowToWrite}:${rowToWrite + rows.length}`;
      const formattedRows = this.valuesFormatter.formatRowsValues(
        rows,
        this.reportDataHeaders,
        this.spreadsheetTimeZone
      );

      await this.adapter.updateValues(this.destination.spreadsheetId, range, formattedRows);

      this.writtenRowsCount += rows.length;
    }, 'Writing data batch to Google Sheets');
  }

  /**
   * Finalizes the report by setting tab color, freezing header row, and adding metadata
   */
  public async finalize(processingError?: Error): Promise<void> {
    await this.executeWithErrorHandling(async () => {
      if (this.writtenRowsCount > 0) {
        const dateNow = DateTime.now().setZone(this.spreadsheetTimeZone);
        const dateNowFormatted = `${dateNow.toFormat('yyyy LLL d, HH:mm:ss')} ${dateNow.zoneName}`;
        const firstColumnDescription = this.reportDataHeaders[0].description;

        await this.adapter.batchUpdate(this.destination.spreadsheetId, [
          this.metadataFormatter.createTabColorAndFreezeHeaderRequest(this.destination.sheetId),
          this.metadataFormatter.createMetadataNoteRequest(
            this.destination.sheetId,
            dateNowFormatted,
            this.dataMartTitle,
            firstColumnDescription
          ),
        ]);
      }
    }, 'Finalizing report with metadata and formatting');
    if (!processingError) {
      await this.consumptionTrackingService.registerSheetsReportRunConsumption(this.report, {
        googleSheetsDocumentTitle: this.spreadsheetTitle,
        googleSheetsListTitle: this.sheetTitle,
      });
    }
  }

  /**
   * Initializes the Google Sheets service with credentials and finds the target sheet
   */
  private async initializeService(report: Report): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      if (!isGoogleSheetsDestination(report.destinationConfig)) {
        throw new Error('Invalid Google Sheets destination configuration provided');
      }
      this.destination = report.destinationConfig;

      if (!isGoogleSheetsCredentials(report.dataDestination.credentials)) {
        throw new Error('Invalid Google Sheets credentials provided');
      }
      this.adapter = this.adapterFactory.create(report.dataDestination.credentials);

      const spreadsheet = await this.adapter.getSpreadsheet(this.destination.spreadsheetId);
      const sheet = this.adapter.findSheetById(spreadsheet, this.destination.sheetId);

      if (!sheet) {
        throw new Error(
          `Failed to find sheet ${this.destination.sheetId} in spreadsheet ${this.destination.spreadsheetId}`
        );
      }

      if (!spreadsheet.properties?.title) {
        throw new Error('Spreadsheet title is undefined');
      }

      if (!sheet.properties?.title) {
        throw new Error('Sheet title is undefined');
      }

      this.spreadsheetTitle = spreadsheet.properties?.title;
      this.sheetTitle = sheet.properties?.title;
      this.availableRowsCount = sheet.properties?.gridProperties?.rowCount ?? 0;
      this.availableColumnsCount = sheet.properties?.gridProperties?.columnCount ?? 0;
      this.spreadsheetTimeZone = spreadsheet.properties?.timeZone ?? 'UTC';
      this.dataMartTitle = report.dataMart.title;
      this.report = report;
    }, 'Initializing Google Sheets service and locating target sheet');
  }

  /**
   * Prepares the sheet columns by adding columns if needed
   */
  private async prepareSheetColumns(columnsCount: number): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const columnsToAllocate = columnsCount - this.availableColumnsCount;

      if (columnsToAllocate <= 0) {
        return;
      }

      await this.adapter.appendDimensionToSheet(
        this.destination.spreadsheetId,
        this.destination.sheetId,
        columnsToAllocate,
        'COLUMNS'
      );
    }, 'Adding columns to sheet as needed');
  }

  /**
   * Ensures there are enough rows in the sheet for the data to be written
   */
  private async ensureRowsAvailable(rowsToWrite: number): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const rowsNeeded = this.writtenRowsCount + rowsToWrite;
      const rowsToAllocate = rowsNeeded - this.availableRowsCount;

      if (rowsToAllocate <= 0) {
        return;
      }

      await this.adapter.appendDimensionToSheet(
        this.destination.spreadsheetId,
        this.destination.sheetId,
        rowsToAllocate,
        'ROWS'
      );

      this.availableRowsCount += rowsToAllocate;
    }, 'Adding rows to sheet to accommodate data');
  }

  /**
   * Clears all content from the sheet
   */
  private async clearSheet(): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      await this.adapter.clearSheet(this.destination.spreadsheetId, this.sheetTitle);
    }, 'Clearing all content from sheet');
  }

  /**
   * Writes and formats the header row
   */
  private async writeHeaders(): Promise<void> {
    return this.executeWithErrorHandling(async () => {
      const { spreadsheetId, sheetId } = this.destination;
      const headers = this.reportDataHeaders;

      // Write header values
      await this.adapter.updateValues(spreadsheetId, `'${this.sheetTitle}'`, [
        headers.map(h => h.alias ?? h.name),
      ]);

      // Format headers
      const descriptions = headers.map((h, i) =>
        this.metadataFormatter.createNoteRequest(sheetId, h.description, 0, i)
      );

      await this.adapter.batchUpdate(spreadsheetId, [
        this.headerFormatter.createHeaderFormatRequest(sheetId, headers.length),
        ...descriptions,
      ]);

      this.writtenRowsCount++;
    }, 'Writing and formatting column headers');
  }

  /**
   * Executes an operation with consistent error handling and logging
   */
  private async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    try {
      this.logger.debug(`${operationName} started`);
      const result = await operation();
      this.logger.debug(`${operationName} completed`);
      return result;
    } catch (error) {
      this.logger.error(`${operationName} failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
