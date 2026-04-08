import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { ReportDeletedEvent } from '../../../events/report-deleted.event';
import { DataDestinationType } from '../../enums/data-destination-type.enum';
import { isGoogleSheetsConfig } from '../../data-destination-config.guards';
import { GoogleSheetsApiAdapterFactory } from '../adapters/google-sheets-api-adapter.factory';
import { DataDestination } from '../../../entities/data-destination.entity';

@Injectable()
export class GoogleSheetsReportDeletedListener {
  private readonly logger = new Logger(GoogleSheetsReportDeletedListener.name);

  constructor(
    private readonly adapterFactory: GoogleSheetsApiAdapterFactory,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>
  ) {}

  @OnEvent('report.deleted', { async: true })
  async handleReportDeletedEvent(event: ReportDeletedEvent) {
    const {
      reportId,
      dataMartId,
      projectId,
      dataDestinationId,
      dataDestinationType,
      destinationConfig,
    } = event.payload;

    this.logger.debug(
      `[Metadata] Received report.deleted event for report ${reportId} | ` +
        `Destination type: ${dataDestinationType} | DataMart: ${dataMartId}`
    );

    if (dataDestinationType !== DataDestinationType.GOOGLE_SHEETS) {
      this.logger.debug(
        `[Metadata] Skipping cleanup - destination type is ${dataDestinationType}, not GOOGLE_SHEETS`
      );
      return;
    }

    if (!isGoogleSheetsConfig(destinationConfig)) {
      this.logger.warn(
        `[Metadata] Invalid destination config for report ${reportId} | ` +
          `Config type: ${destinationConfig?.type}`
      );
      return;
    }

    const { spreadsheetId, sheetId } = destinationConfig;

    this.logger.debug(
      `[Metadata] Starting Google Sheets metadata cleanup for report ${reportId} | ` +
        `Spreadsheet: ${spreadsheetId} | Sheet: ${sheetId}`
    );

    try {
      // Re-fetch the destination entity so that the credential relation (eager) is available.
      // The report entity was already deleted, but the destination itself is not.
      const dataDestination = await this.dataDestinationRepository.findOne({
        where: { id: dataDestinationId },
      });

      if (!dataDestination) {
        this.logger.warn(
          `[Metadata] DataDestination ${dataDestinationId} not found | ` +
            `Report: ${reportId} | Cannot cleanup metadata`
        );
        return;
      }

      this.logger.debug(
        `[Metadata] Creating Google Sheets adapter for destination ${dataDestinationId}`
      );
      const adapter = await this.adapterFactory.createFromDestination(dataDestination);
      if (!adapter) {
        this.logger.error(
          `[Metadata] Failed to create Google Sheets adapter for destination ${dataDestinationId} | ` +
            `Report: ${reportId} | Cannot cleanup metadata`
        );
        return;
      }

      this.logger.debug(`[Metadata] Fetching developer metadata for sheet ${sheetId}`);
      const existingMetadata = await adapter.getDeveloperMetadata(spreadsheetId, sheetId);

      // Find ALL OWOX metadata entries for this sheet that belong to this specific report
      const allOwoxMetadataForSheet = adapter
        .findAllOwoxReportMetadataForSheet(existingMetadata, sheetId)
        .filter(m => {
          try {
            return JSON.parse(m.metadataValue ?? '{}').reportId === reportId;
          } catch {
            return false;
          }
        });

      if (allOwoxMetadataForSheet.length === 0) {
        this.logger.debug(
          `[Metadata] No developer metadata found for report ${reportId} | ` +
            `Skipping cleanup (metadata may not have been created yet)`
        );
        return;
      }

      // Extract all metadata IDs to delete (handles duplicates)
      const metadataIdsToDelete = allOwoxMetadataForSheet
        .map(m => m.metadataId)
        .filter((id): id is number => id !== undefined && id !== null);

      if (metadataIdsToDelete.length === 0) {
        this.logger.warn(
          `[Metadata] Found ${allOwoxMetadataForSheet.length} metadata entries but no valid IDs for report ${reportId} | Skipping cleanup`
        );
        return;
      }

      if (metadataIdsToDelete.length > 1) {
        this.logger.warn(
          `[Metadata] Found ${metadataIdsToDelete.length} duplicate metadata entries for report ${reportId}. ` +
            `Deleting all duplicates.`
        );
      } else {
        this.logger.debug(
          `[Metadata] Found metadata (ID: ${metadataIdsToDelete[0]}) for report ${reportId} | Deleting...`
        );
      }

      // Delete ALL matching developer metadata entries (including duplicates)
      await adapter.deleteDeveloperMetadata(spreadsheetId, metadataIdsToDelete);

      this.logger.debug(
        `[Metadata] ✅ Successfully deleted ${metadataIdsToDelete.length} metadata entr${metadataIdsToDelete.length === 1 ? 'y' : 'ies'} for report ${reportId} | ` +
          `Spreadsheet: ${spreadsheetId} | Sheet: ${sheetId} | Metadata IDs: ${metadataIdsToDelete.join(', ')}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `[Metadata] ❌ Failed to delete developer metadata for report ${reportId} | ` +
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
