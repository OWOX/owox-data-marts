import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsApiAdapterFactory } from '../../data-destination-types/google-sheets/adapters/google-sheets-api-adapter.factory';
import { GoogleSheetsApiAdapter } from '../../data-destination-types/google-sheets/adapters/google-sheets-api.adapter';
import { toSheetTitle } from '../../data-destination-types/google-sheets/sheet-title.util';
import { AddGoogleSheetToSpreadsheetCommand } from '../../dto/domain/google-sheets/add-google-sheet-to-spreadsheet.command';
import { AddedGoogleSheetDto } from '../../dto/domain/google-sheets/added-google-sheet.dto';
import { GoogleApiException } from '../../exceptions/google-oauth.exceptions';
import { DataDestinationService } from '../../services/data-destination.service';

/**
 * Adds a new, empty sheet (tab) to a spreadsheet the destination's Google account
 * can already edit — the counterpart of {@link CreateGoogleSheetDocumentService}
 * for the "several related exports in ONE document" case: the first report gets a
 * new file, the next ones become tabs of it.
 *
 * The sheet is always created, never reused: a same-named tab may hold data the
 * user maintains by hand, and the next report run would overwrite it. Google
 * rejects duplicate titles anyway, so the collision is reported up front with a
 * remedy instead of surfacing as a raw API error.
 *
 * No sharing step: the spreadsheet already exists, so whoever asked for the first
 * export was shared on it then, and a spreadsheet the requester picked by id is
 * one they can open.
 */
@Injectable()
export class AddGoogleSheetToSpreadsheetService {
  private readonly logger = new Logger(AddGoogleSheetToSpreadsheetService.name);

  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly adapterFactory: GoogleSheetsApiAdapterFactory
  ) {}

  async run(command: AddGoogleSheetToSpreadsheetCommand): Promise<AddedGoogleSheetDto> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      command.destinationId,
      command.projectId
    );
    if (destination.type !== DataDestinationType.GOOGLE_SHEETS) {
      throw new BadRequestException('Destination is not a Google Sheets destination');
    }

    const adapter = await this.adapterFactory.createFromDestination(destination);
    if (!adapter) {
      throw new BadRequestException(
        'No authentication method available for Google Sheets: neither OAuth nor Service Account credentials found'
      );
    }

    const { spreadsheetId } = command;
    const spreadsheet = await adapter.getSpreadsheet(spreadsheetId).catch((error: unknown) => {
      throw this.translateGoogleError(
        error,
        spreadsheetId,
        `Can't open Google spreadsheet ${spreadsheetId} with this destination's Google account. ` +
          'Check that the spreadsheet exists and is shared with the connected account with Editor access, ' +
          'or omit spreadsheet_id to create a new file.'
      );
    });

    const title = toSheetTitle(command.title);
    if (adapter.findSheetByTitle(spreadsheet, title)) {
      throw new BusinessViolationException(
        `Spreadsheet ${spreadsheetId} already has a sheet named "${title}". ` +
          'Use a different report name, or omit spreadsheet_id to create a new file.',
        { spreadsheetId, sheetTitle: title }
      );
    }

    // Reading metadata succeeds with Viewer access; only the write reveals that
    // the connected account cannot edit. Translate that failure with the same
    // remedy — otherwise the most common permission problem surfaces as a raw
    // Google error while the friendly message above never fires.
    const sheetId = await adapter.addSheet(spreadsheetId, title).catch((error: unknown) => {
      throw this.translateGoogleError(
        error,
        spreadsheetId,
        `Can't add a sheet to Google spreadsheet ${spreadsheetId}: the destination's connected Google ` +
          'account needs Editor access to it (Viewer is not enough). Share the spreadsheet with that ' +
          'account as an editor, or omit spreadsheet_id to create a new file.'
      );
    });
    this.logger.log(
      `Added sheet "${title}" (gid ${sheetId}) to spreadsheet ${spreadsheetId} for destination ${destination.id}`
    );

    return new AddedGoogleSheetDto(spreadsheetId, sheetId, title);
  }

  /**
   * A transient Google fault (429/5xx) is not an access problem — sending the
   * user to fix sharing that was never broken would erode trust in the message.
   * Anything else (403, 404, an unknown status) is reported with the remedy.
   */
  private translateGoogleError(error: unknown, spreadsheetId: string, remedy: string): Error {
    const cause = castError(error);
    const status = GoogleSheetsApiAdapter.httpStatusOf(cause);
    if (status === 429 || (status !== undefined && status >= 500)) {
      return new GoogleApiException(
        'Google Sheets is temporarily unavailable. Please try again in a few minutes.',
        cause
      );
    }
    return new BusinessViolationException(`${remedy} Details: ${cause.message}`, { spreadsheetId });
  }
}
