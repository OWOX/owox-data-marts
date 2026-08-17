import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ReconnectGoogleSheetCommand } from '../../dto/domain/google-sheets/reconnect-google-sheet.command';
import { ReconnectGoogleSheetResponseDto } from '../../dto/presentation/google-sheets/reconnect-google-sheet-response.dto';
import { isGoogleSheetsConfig } from '../../data-destination-types/data-destination-config.guards';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsApiAdapterFactory } from '../../data-destination-types/google-sheets/adapters/google-sheets-api-adapter.factory';
import { GoogleSheetsApiAdapter } from '../../data-destination-types/google-sheets/adapters/google-sheets-api.adapter';
import { GoogleApiException } from '../../exceptions/google-oauth.exceptions';
import {
  GoogleSheetNotFound,
  spreadsheetNotAccessibleMessage,
} from '../../errors/google-sheet-not-found.error';
import { ReportAccessService } from '../../services/report-access.service';
import { ReportService } from '../../services/report.service';

/** Google's hard cap for a sheet (tab) name. */
const MAX_SHEET_TITLE_LENGTH = 100;
/** Used when the report title sanitizes down to nothing. */
const DEFAULT_SHEET_TITLE = 'Report data';

/**
 * Google accepts almost any character in a sheet name but caps it at 100 and
 * rejects empty. Apostrophes stay as typed — A1 ranges escape them at
 * construction (`quoteA1SheetTitle` in the adapter), and rewriting them here
 * would make reuse-by-title miss a hand-made sheet whose name contains one.
 * The cap counts code points, not UTF-16 units, so an emoji at the boundary is
 * kept or dropped whole, never bisected.
 */
function toSheetTitle(raw: string): string {
  const cleaned = Array.from(raw.trim()).slice(0, MAX_SHEET_TITLE_LENGTH).join('').trim();
  return cleaned || DEFAULT_SHEET_TITLE;
}

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
 * explicit choice: clicking "Reconnect & run" on the failed report is the consent.
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

    // Both checks, on the already-loaded report: rebinding the config is a
    // mutation, and creating a sheet is a structural write into the customer's
    // spreadsheet with the stored credentials — the same consent /run requires.
    // The UI mirrors this by offering the action only with canEditConfig && canRun.
    await this.reportAccessService.checkMutateAccessForReport(
      command.userId,
      command.roles,
      report,
      command.projectId
    );
    await this.reportAccessService.checkOperateAccessForReport(
      command.userId,
      command.roles,
      report,
      command.projectId
    );

    if (report.dataDestination.type !== DataDestinationType.GOOGLE_SHEETS) {
      throw new BadRequestException('Report does not write to Google Sheets');
    }
    if (!isGoogleSheetsConfig(report.destinationConfig)) {
      throw new BadRequestException('Report has no valid Google Sheets destination config');
    }

    const { spreadsheetId } = report.destinationConfig;
    const title = toSheetTitle(report.title);

    const adapter = await this.adapterFactory.createFromDestination(report.dataDestination);
    if (!adapter) {
      throw new BadRequestException(
        'No authentication method available for Google Sheets: neither OAuth nor Service Account credentials found'
      );
    }

    const spreadsheet = await adapter.getSpreadsheet(spreadsheetId).catch((error: Error) => {
      // A transient Google fault (429/5xx) is not an access problem — sending the
      // user to fix sharing that was never broken would erode trust in the message.
      const status = GoogleSheetsApiAdapter.httpStatusOf(error);
      if (status === 429 || (status !== undefined && status >= 500)) {
        throw new GoogleApiException(
          'Google Sheets is temporarily unavailable. Please try again in a few minutes.',
          error
        );
      }
      // The spreadsheet itself is unreachable (deleted, trashed, or unshared) —
      // reconnecting a sheet inside it cannot help, and the user needs the other
      // remedy: fix access, or pick a different document.
      throw new GoogleSheetNotFound(spreadsheetNotAccessibleMessage(spreadsheetId, error.message), {
        spreadsheetId,
      });
    });

    // Repair only what is broken. If the stored gid still resolves, the report is
    // not suffering from a missing sheet, and rebinding it by title would silently
    // move where data lands — onto a same-named sheet the user maintains by hand,
    // for instance. Report the sheet as-is and let the caller just run.
    const currentSheet = adapter.findSheetById(spreadsheet, report.destinationConfig.sheetId);
    if (currentSheet?.properties?.title) {
      return {
        spreadsheetId,
        sheetId: report.destinationConfig.sheetId,
        sheetTitle: currentSheet.properties.title,
        created: false,
        changed: false,
      };
    }

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

    return { spreadsheetId, sheetId, sheetTitle: title, created, changed: true };
  }
}
