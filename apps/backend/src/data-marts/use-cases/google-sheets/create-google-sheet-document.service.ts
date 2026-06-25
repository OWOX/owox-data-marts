import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CreateGoogleSheetDocumentCommand } from '../../dto/domain/google-sheets/create-google-sheet-document.command';
import { CreateGoogleSheetDocumentResponseDto } from '../../dto/presentation/google-sheets/create-google-sheet-document-response.dto';
import { DataDestinationService } from '../../services/data-destination.service';
import { GoogleOAuthClientService } from '../../services/google-oauth/google-oauth-client.service';
import { DataDestinationCredentialsResolver } from '../../data-destination-types/data-destination-credentials-resolver.service';
import { GoogleSheetsApiAdapter } from '../../data-destination-types/google-sheets/adapters/google-sheets-api.adapter';
import { GoogleSheetsCredentialsSchema } from '../../data-destination-types/google-sheets/schemas/google-sheets-credentials.schema';
import { DataDestination } from '../../entities/data-destination.entity';
import { DataDestinationType } from '../../data-destination-types/enums/data-destination-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import {
  CredentialsNotFoundException,
  OAuthNotConnectedException,
  ServiceAccountRequiresFolderException,
  SheetFolderCreateFailedException,
} from '../../exceptions/google-oauth.exceptions';

const DEFAULT_DOCUMENT_TITLE = 'OWOX Report';

/**
 * Auto-creates a new, empty Google Sheet for a Google Sheets destination and
 * returns its identifiers. This is the reusable core behind the "Create document"
 * button (and, later, the MCP add_report flow).
 *
 * Auth is resolved EXPLICITLY by credential type (not via the SA-first factory)
 * so the right path is always chosen:
 * - OAuth: the file is created in the connected user's Drive (root).
 * - Service Account: the file is created inside the destination's configured
 *   shared Drive folder, using a separate Drive-scoped SA JWT.
 */
@Injectable()
export class CreateGoogleSheetDocumentService {
  private readonly logger = new Logger(CreateGoogleSheetDocumentService.name);

  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly googleOAuthClientService: GoogleOAuthClientService,
    private readonly credentialsResolver: DataDestinationCredentialsResolver
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

    const title = command.title?.trim() || DEFAULT_DOCUMENT_TITLE;

    switch (destination.credential?.type) {
      case DestinationCredentialType.GOOGLE_OAUTH:
        return this.createViaOAuth(destination, title);
      case DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT:
        return this.createViaServiceAccount(destination, title);
      default:
        throw new OAuthNotConnectedException(destination.id);
    }
  }

  /**
   * OAuth path: creates the file in the connected user's Drive root. Folder
   * placement is intentionally NOT supported for OAuth — it would require a
   * restricted Drive scope (Google security assessment) or the Drive Picker.
   * Folder-targeted auto-creation is handled by the Service Account path.
   */
  private async createViaOAuth(
    destination: DataDestination,
    title: string
  ): Promise<CreateGoogleSheetDocumentResponseDto> {
    const oauth2Client = await this.googleOAuthClientService
      .getDestinationOAuth2Client(destination.id)
      .catch((error: unknown) => {
        if (error instanceof CredentialsNotFoundException) {
          throw new OAuthNotConnectedException(destination.id);
        }
        throw error;
      });

    const adapter = new GoogleSheetsApiAdapter(undefined, oauth2Client);
    const result = await adapter.createSpreadsheet(title);
    this.logger.log(
      `Auto-created Google Sheet ${result.spreadsheetId} via OAuth for destination ${destination.id}`
    );
    return result;
  }

  /**
   * Service Account path: creates the file inside the destination's configured
   * shared Drive folder, using a Drive-scoped SA JWT (kept separate from the
   * narrow Sheets-only scope used by other SA operations).
   */
  private async createViaServiceAccount(
    destination: DataDestination,
    title: string
  ): Promise<CreateGoogleSheetDocumentResponseDto> {
    const folderId = destination.config?.folderId?.trim();
    if (!folderId) {
      throw new ServiceAccountRequiresFolderException(destination.id);
    }

    const resolved = await this.credentialsResolver.resolve(destination).catch(() => undefined);
    const parsed = GoogleSheetsCredentialsSchema.safeParse(resolved);
    if (!parsed.success || !parsed.data.serviceAccountKey) {
      throw new BadRequestException(
        'Service account credentials are not configured for this destination'
      );
    }

    const jwt = GoogleSheetsApiAdapter.createServiceAccountClient(
      parsed.data.serviceAccountKey,
      GoogleSheetsApiAdapter.SERVICE_ACCOUNT_DRIVE_CREATE_SCOPES
    );
    const adapter = new GoogleSheetsApiAdapter(undefined, jwt);

    let result: CreateGoogleSheetDocumentResponseDto;
    try {
      result = await adapter.createSpreadsheetInFolder(title, folderId);
    } catch (error) {
      throw new SheetFolderCreateFailedException(destination.id, error);
    }
    this.logger.log(
      `Auto-created Google Sheet ${result.spreadsheetId} via Service Account in folder ${folderId} for destination ${destination.id}`
    );
    return result;
  }
}
