import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { sheets_v4 } from 'googleapis';
import { ReportCreatedEvent } from '../../../events/report-created.event';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { isGoogleSheetsConfig } from '../../data-destination-config.guards';
import { SheetMetadataFormatter } from '../services/sheet-formatters/sheet-metadata-formatter';
import { GoogleSheetsApiAdapterFactory } from '../adapters/google-sheets-api-adapter.factory';
import { ReportService } from '../../../services/report.service';

@Injectable()
export class GoogleSheetsReportCreatedListener {
  private readonly logger = new Logger(GoogleSheetsReportCreatedListener.name);

  constructor(
    private readonly adapterFactory: GoogleSheetsApiAdapterFactory,
    private readonly metadataFormatter: SheetMetadataFormatter,
    private readonly reportService: ReportService
  ) {}

  @OnEvent('report.created', { async: true })
  async handleReportCreatedEvent(event: ReportCreatedEvent) {
    const { reportId, dataMartId, projectId, dataDestinationType } = event.payload;

    this.logger.debug(
      `[Metadata] Received report.created event for report ${reportId} | ` +
        `Destination type: ${dataDestinationType} | DataMart: ${dataMartId}`
    );

    if (dataDestinationType !== DataDestinationType.GOOGLE_SHEETS) {
      this.logger.debug(
        `[Metadata] Skipping - destination type is ${dataDestinationType}, not GOOGLE_SHEETS`
      );
      return;
    }

    const report = await this.reportService.getByIdAndDataMartIdAndProjectId(
      reportId,
      dataMartId,
      projectId
    );
    const { dataDestination, dataMart } = report;

    if (!isGoogleSheetsConfig(report.destinationConfig)) {
      this.logger.warn(
        `[Metadata] Invalid destination config for report ${reportId} | ` +
          `Config type: ${report.destinationConfig?.type}`
      );
      return;
    }

    const { spreadsheetId, sheetId } = report.destinationConfig;

    this.logger.debug(
      `[Metadata] Processing Google Sheets metadata for report ${reportId} | ` +
        `Spreadsheet: ${spreadsheetId} | Sheet: ${sheetId}`
    );

    try {
      this.logger.debug(
        `[Metadata] Creating Google Sheets adapter for destination ${dataDestination.id}`
      );
      const adapter = await this.adapterFactory.createFromDestination(dataDestination);
      if (!adapter) {
        this.logger.error(
          `[Metadata] Failed to create Google Sheets adapter for destination ${dataDestination.id} | ` +
            `Report: ${reportId} | Check OAuth/Service Account credentials`
        );
        return;
      }

      this.logger.debug(`[Metadata] Fetching existing developer metadata for sheet ${sheetId}`);
      const existingMetadata = await adapter.getDeveloperMetadata(spreadsheetId, sheetId);
      const allOwoxMetadata = adapter.findAllOwoxReportMetadataForSheet(existingMetadata, sheetId);

      this.logger.debug(
        `[Metadata] Found ${allOwoxMetadata.length} OWOX metadata entries for sheet ${sheetId}`
      );

      const requests: sheets_v4.Schema$Request[] = [];

      if (allOwoxMetadata.length > 1) {
        const existingReportIds = allOwoxMetadata.map(m => {
          try {
            return JSON.parse(m.metadataValue ?? '{}').reportId;
          } catch {
            return null;
          }
        });
        this.logger.warn(
          `[Metadata] Found ${allOwoxMetadata.length} duplicate OWOX metadata entries for sheet ${sheetId} ` +
            `(reportIds: ${existingReportIds.join(', ')}). Replacing all with report ${reportId}.`
        );
        const duplicateIds = allOwoxMetadata
          .map(m => m.metadataId)
          .filter((id): id is number => id !== undefined && id !== null);
        await adapter.deleteDeveloperMetadata(spreadsheetId, duplicateIds);
        requests.push(
          this.metadataFormatter.createDeveloperMetadataRequest(
            sheetId,
            dataMart.projectId,
            dataMart.id,
            report.id
          )
        );
      } else if (allOwoxMetadata.length === 1 && allOwoxMetadata[0].metadataId) {
        const existing = allOwoxMetadata[0];
        try {
          const existingReportId = JSON.parse(existing.metadataValue ?? '{}').reportId;
          if (existingReportId !== report.id) {
            this.logger.warn(
              `[Metadata] Sheet ${sheetId} already has metadata for report ${existingReportId}. ` +
                `Overwriting with report ${reportId} as the new source of truth.`
            );
          }
        } catch {
          /* ignore parse error */
        }
        this.logger.debug(
          `[Metadata] Updating existing metadata (ID: ${existing.metadataId}) for report ${reportId}`
        );
        requests.push(
          this.metadataFormatter.updateDeveloperMetadataRequest(
            existing.metadataId!,
            dataMart.projectId,
            dataMart.id,
            report.id
          )
        );
      } else {
        this.logger.debug(
          `[Metadata] Creating new developer metadata for report ${reportId} | ` +
            `Project: ${dataMart.projectId} | DataMart: ${dataMart.id}`
        );
        requests.push(
          this.metadataFormatter.createDeveloperMetadataRequest(
            sheetId,
            dataMart.projectId,
            dataMart.id,
            report.id
          )
        );
      }

      this.logger.debug(`[Metadata] Sending batchUpdate request to Google Sheets API`);
      await adapter.batchUpdate(spreadsheetId, requests);

      this.logger.debug(
        `[Metadata] Successfully wrote developer metadata for report ${reportId} | ` +
          `Spreadsheet: ${spreadsheetId} | Sheet: ${sheetId}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `[Metadata] Failed to write developer metadata for report ${reportId} | ` +
          `Error: ${message}`,
        stack
      );

      this.logger.error(
        `[Metadata] Error context | Report: ${reportId} | ` +
          `DataMart: ${dataMartId} | Project: ${projectId} | ` +
          `Spreadsheet: ${spreadsheetId} | Sheet: ${sheetId}`
      );
    }
  }
}
