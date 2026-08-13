import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ReconnectGoogleSheetCommand } from '../../dto/domain/google-sheets/reconnect-google-sheet.command';
import { ReconnectGoogleSheetResponseDto } from '../../dto/presentation/google-sheets/reconnect-google-sheet-response.dto';
import { isGoogleSheetsConfig } from '../../data-destination-types/data-destination-config.guards';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsApiAdapterFactory } from '../../data-destination-types/google-sheets/adapters/google-sheets-api-adapter.factory';
import {
  GoogleSheetNotFound,
  spreadsheetNotAccessibleMessage,
} from '../../errors/google-sheet-not-found.error';
import { ReportAccessService } from '../../services/report-access.service';
import { ReportService } from '../../services/report.service';

/**
 * Reconnects a Google Sheets report to a sheet identified by TITLE, repairing the
 * stored `destinationConfig.sheetId`.
 *
 * Why title and not gid: the gid captured when the report was created dies the
 * moment someone deletes the sheet, or an import re-creates the spreadsheet's
 * sheets. The title is what the user recognises, and the only handle they can act
 * on. See {@link GoogleSheetNotFound}.
 *
 * Reuse before create is deliberate — the common repair is "someone deleted
 * 'Sheet1' and made a new one by hand", where a sheet with the wanted title
 * already exists under a different gid. Creating a second one is impossible
 * anyway (Google rejects duplicate titles) and would be wrong if it were not.
 *
 * Reusing an existing sheet means the next run writes into it. That is the user's
 * explicit choice: they type or confirm the title before this runs.
 */
@Injectable()
export class ReconnectGoogleSheetService {
  private readonly logger = new Logger(ReconnectGoogleSheetService.name);

  constructor(
    private readonly reportService: ReportService,
    private readonly reportAccessService: ReportAccessService,
    private readonly adapterFactory: GoogleSheetsApiAdapterFactory
  ) {}

  async run(command: ReconnectGoogleSheetCommand): Promise<ReconnectGoogleSheetResponseDto> {
    const report = await this.reportService.getByIdAndProjectIdWithDestination(
      command.reportId,
      command.projectId
    );

    // Changing where a report writes is a config mutation, not an operation.
    await this.reportAccessService.checkMutateAccess(
      command.userId,
      command.roles,
      command.reportId,
      command.projectId
    );

    if (report.dataDestination.type !== DataDestinationType.GOOGLE_SHEETS) {
      throw new BadRequestException('Report does not write to Google Sheets');
    }
    if (!isGoogleSheetsConfig(report.destinationConfig)) {
      throw new BadRequestException('Report has no valid Google Sheets destination config');
    }

    const { spreadsheetId } = report.destinationConfig;
    const title = command.title?.trim() || report.title.trim();
    if (!title) {
      throw new BadRequestException('Sheet title is required');
    }

    const adapter = await this.adapterFactory.createFromDestination(report.dataDestination);
    if (!adapter) {
      throw new BadRequestException(
        'No authentication method available for Google Sheets: neither OAuth nor Service Account credentials found'
      );
    }

    const spreadsheet = await adapter.getSpreadsheet(spreadsheetId).catch((error: Error) => {
      // The spreadsheet itself is unreachable — reconnecting a sheet inside it
      // cannot help, and the user needs the other remedy (fix access, or pick a
      // different document).
      throw new GoogleSheetNotFound(spreadsheetNotAccessibleMessage(spreadsheetId, error.message), {
        spreadsheetId,
      });
    });

    const existingSheetId = adapter.findSheetByTitle(spreadsheet, title)?.properties?.sheetId;
    // Null-checked, not falsy-checked: gid 0 is the default first sheet.
    const created = existingSheetId === null || existingSheetId === undefined;
    const sheetId = created ? await adapter.addSheet(spreadsheetId, title) : existingSheetId;

    await this.reportService.updateDestinationConfig(report.id, {
      ...report.destinationConfig,
      sheetId,
    });

    this.logger.log(
      `Reconnected report ${report.id} to sheet "${title}" (gid ${sheetId}, ${
        created ? 'created' : 'reused'
      }) in spreadsheet ${spreadsheetId}`
    );

    return { spreadsheetId, sheetId, sheetTitle: title, created };
  }
}
