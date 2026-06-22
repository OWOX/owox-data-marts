import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateGoogleSheetDocumentCommand } from '../../dto/domain/google-sheets/create-google-sheet-document.command';
import { CreateGoogleSheetDocumentResponseDto } from '../../dto/presentation/google-sheets/create-google-sheet-document-response.dto';
import { DataDestinationService } from '../../services/data-destination.service';
import { GoogleOAuthClientService } from '../../services/google-oauth/google-oauth-client.service';
import { GoogleSheetsApiAdapter } from '../../data-destination-types/google-sheets/adapters/google-sheets-api.adapter';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import {
  CredentialsNotFoundException,
  OAuthNotConnectedException,
  ServiceAccountRequiresFolderException,
} from '../../exceptions/google-oauth.exceptions';

const DEFAULT_DOCUMENT_TITLE = 'OWOX Report';

/**
 * Auto-creates a new, empty Google Sheet for a Google Sheets destination and
 * returns its identifiers. This is the reusable core behind the "Create GS"
 * button (and, later, the MCP add_report flow).
 *
 * Phase 1 is OAuth-only: it resolves the destination's OAuth client EXPLICITLY
 * (not via the SA-first factory) so a dual-credential destination can never
 * silently create an invisible file in the service account's own Drive.
 */
@Injectable()
export class CreateGoogleSheetDocumentService {
  private readonly logger = new Logger(CreateGoogleSheetDocumentService.name);

  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly googleOAuthClientService: GoogleOAuthClientService
  ) {}

  async run(
    command: CreateGoogleSheetDocumentCommand
  ): Promise<CreateGoogleSheetDocumentResponseDto> {
    const destination = await this.dataDestinationService.getByIdAndProjectId(
      command.destinationId,
      command.projectId
    );

    if (destination.type !== DataDestinationType.GOOGLE_SHEETS) {
      throw new BadRequestException('Destination is not a Google Sheets destination');
    }

    const credentialType = destination.credential?.type;

    // Phase 1 supports OAuth destinations only. SA-based creation needs a shared
    // Drive folder (otherwise the file lands in the SA's invisible My Drive) and
    // ships in a later phase.
    if (credentialType !== DestinationCredentialType.GOOGLE_OAUTH) {
      if (credentialType === DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT) {
        throw new ServiceAccountRequiresFolderException(destination.id);
      }
      throw new OAuthNotConnectedException(destination.id);
    }

    const oauth2Client = await this.googleOAuthClientService
      .getDestinationOAuth2Client(destination.id)
      .catch((error: unknown) => {
        if (error instanceof CredentialsNotFoundException) {
          throw new OAuthNotConnectedException(destination.id);
        }
        throw error;
      });

    const adapter = new GoogleSheetsApiAdapter(undefined, oauth2Client);
    const title = command.title?.trim() || DEFAULT_DOCUMENT_TITLE;
    const { spreadsheetId, sheetId } = await adapter.createSpreadsheet(title);

    this.logger.log(
      `Auto-created Google Sheet ${spreadsheetId} (sheetId=${sheetId}) for destination ${destination.id}`
    );

    return { spreadsheetId, sheetId };
  }
}
