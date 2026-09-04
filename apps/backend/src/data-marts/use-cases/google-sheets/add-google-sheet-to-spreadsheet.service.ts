import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import type { drive_v3 } from 'googleapis';
import { BusinessViolationException } from '../../../common/exceptions/business-violation.exception';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { GoogleSheetsApiAdapterFactory } from '../../data-destination-types/google-sheets/adapters/google-sheets-api-adapter.factory';
import { GoogleSheetsApiAdapter } from '../../data-destination-types/google-sheets/adapters/google-sheets-api.adapter';
import { toSheetTitle } from '../../data-destination-types/google-sheets/sheet-title.util';
import { AddGoogleSheetToSpreadsheetCommand } from '../../dto/domain/google-sheets/add-google-sheet-to-spreadsheet.command';
import { AddedGoogleSheetDto } from '../../dto/domain/google-sheets/added-google-sheet.dto';
import { GoogleApiException } from '../../exceptions/google-oauth.exceptions';
import { DataDestinationService } from '../../services/data-destination.service';

/** Outcome of asking Drive whether the requester can open the spreadsheet. */
type RequesterAccess = 'confirmed' | 'denied' | 'unknown';

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
 * The requester's access is CHECKED, never granted. The spreadsheet id may come
 * from get_data_mart_reports, which lists other people's reports, and the
 * destination's credentials could add a tab to a document the requester cannot
 * open — sharing it with them on the way would hand any project member with USE
 * on the destination writer access to any file that account can edit. So a
 * spreadsheet confirmed NOT to be shared with the requester is refused before
 * anything is written, and one whose sharing cannot be resolved is reported as
 * unconfirmed so the caller can warn about the link.
 */
@Injectable()
export class AddGoogleSheetToSpreadsheetService {
  private readonly logger = new Logger(AddGoogleSheetToSpreadsheetService.name);

  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly adapterFactory: GoogleSheetsApiAdapterFactory,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
  ) {}

  async run(command: AddGoogleSheetToSpreadsheetCommand): Promise<AddedGoogleSheetDto> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      command.destinationId,
      command.projectId
    );
    if (destination.type !== DataDestinationType.GOOGLE_SHEETS) {
      throw new BadRequestException('Destination is not a Google Sheets destination');
    }

    const client = await this.adapterFactory.createWithDriveScope(destination);
    if (!client) {
      throw new BadRequestException(
        'No authentication method available for Google Sheets: neither OAuth nor Service Account credentials found'
      );
    }
    const { adapter, driveCapable } = client;

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

    // Before the write, so a refused spreadsheet gains no orphan tab.
    const requesterEmail = await this.resolveRequesterEmail(command);
    const access = driveCapable
      ? await this.checkRequesterAccess(adapter, spreadsheetId, requesterEmail)
      : 'unknown';
    if (access === 'denied') {
      throw new BusinessViolationException(
        `Google spreadsheet ${spreadsheetId} is not shared with you (${requesterEmail}), so a report ` +
          'written into it could not be opened. Ask its owner to share it with you, pick a spreadsheet ' +
          'you can open, or omit spreadsheet_id to create a new file.',
        { spreadsheetId }
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
      `Added sheet "${title}" (gid ${sheetId}) to spreadsheet ${spreadsheetId} for destination ${destination.id} (requester access: ${access})`
    );

    return new AddedGoogleSheetDto(spreadsheetId, sheetId, title, access === 'confirmed');
  }

  /**
   * Resolves the requesting user's email — from the command, or via the IDP by
   * userId when the auth context did not carry an email (e.g. API-key flows).
   */
  private async resolveRequesterEmail(
    command: AddGoogleSheetToSpreadsheetCommand
  ): Promise<string | undefined> {
    const fromCommand = command.userEmail?.trim();
    if (fromCommand) {
      return fromCommand;
    }
    if (command.requestedByUserId) {
      const projection = await this.idpProjectionsFacade
        .getUserProjection(command.requestedByUserId)
        .catch(() => undefined);
      return projection?.email ?? undefined;
    }
    return undefined;
  }

  /**
   * Reads the file's sharing and decides for the requester. "denied" is claimed
   * only when the ACL is fully resolvable and names neither them, their domain,
   * nor anyone: a group grant cannot be expanded here, so its presence turns a
   * miss into "unknown" rather than into a refusal. Any lookup failure is also
   * "unknown" — the check must never block the export on a Drive hiccup.
   */
  private async checkRequesterAccess(
    adapter: GoogleSheetsApiAdapter,
    spreadsheetId: string,
    requesterEmail: string | undefined
  ): Promise<RequesterAccess> {
    if (!requesterEmail) {
      return 'unknown';
    }
    let permissions: drive_v3.Schema$Permission[];
    try {
      permissions = await adapter.listFilePermissions(spreadsheetId);
    } catch (error) {
      this.logger.warn(
        `Could not read the sharing of spreadsheet ${spreadsheetId}: ${castError(error).message}`
      );
      return 'unknown';
    }
    const email = requesterEmail.toLowerCase();
    const domain = email.slice(email.lastIndexOf('@') + 1);
    let sawGroup = false;
    for (const permission of permissions) {
      switch (permission.type) {
        case 'anyone':
          return 'confirmed';
        case 'user':
          if (permission.emailAddress?.toLowerCase() === email) return 'confirmed';
          break;
        case 'domain':
          if (permission.domain?.toLowerCase() === domain) return 'confirmed';
          break;
        case 'group':
          sawGroup = true;
          break;
        default:
          break;
      }
    }
    return sawGroup ? 'unknown' : 'denied';
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
