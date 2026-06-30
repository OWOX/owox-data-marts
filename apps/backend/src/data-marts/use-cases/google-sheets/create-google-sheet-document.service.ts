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
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import type { GoogleOAuthTokens } from '../../services/google-oauth/google-oauth-flow.service';
import {
  CredentialsNotFoundException,
  GoogleApiException,
  OAuthNotConnectedException,
  ServiceAccountRequiresFolderException,
  SheetFolderCreateFailedException,
} from '../../exceptions/google-oauth.exceptions';

const DEFAULT_DOCUMENT_TITLE = 'OWOX Report';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

/**
 * Auto-creates a new, empty Google Sheet for a Google Sheets destination and
 * returns its identifiers. This is the reusable core behind the "Create document"
 * button (and, later, the MCP add_report flow).
 *
 * Auth is resolved EXPLICITLY by credential type (not via the SA-first factory):
 * - OAuth: the file is created in the connected user's Drive. When the token has
 *   a Drive scope it can be placed in a folder the user picked via the Drive
 *   Picker (drive.file); otherwise it lands in the Drive root.
 * - Service Account: the file is created inside the destination's configured
 *   shared Drive folder, using a separate Drive-scoped SA JWT.
 *
 * After creation, the document is shared (best-effort) with the requesting user
 * so a different user (e.g. a BU who is not the destination owner) can open it.
 */
@Injectable()
export class CreateGoogleSheetDocumentService {
  private readonly logger = new Logger(CreateGoogleSheetDocumentService.name);

  constructor(
    private readonly dataDestinationService: DataDestinationService,
    private readonly googleOAuthClientService: GoogleOAuthClientService,
    private readonly credentialsResolver: DataDestinationCredentialsResolver,
    private readonly idpProjectionsFacade: IdpProjectionsFacade
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
    const requesterEmail = await this.resolveRequesterEmail(command);

    switch (destination.credential?.type) {
      case DestinationCredentialType.GOOGLE_OAUTH:
        return this.createViaOAuth(destination, title, requesterEmail);
      case DestinationCredentialType.GOOGLE_SERVICE_ACCOUNT:
        return this.createViaServiceAccount(destination, title, requesterEmail);
      default:
        throw new OAuthNotConnectedException(destination.id);
    }
  }

  /**
   * OAuth path: creates the file in the connected user's Drive, then shares it
   * with the requester so they can open it. Folder placement IS supported when
   * the token has a Drive scope and a folder was selected via the Drive Picker
   * (drive.file grants access to picker-selected folders); without a Drive scope
   * the file is created in the Drive root.
   *
   * When the token has the Drive scope, the file is created via the Drive API so
   * it is app-authorized and therefore shareable under drive.file; otherwise it
   * falls back to the Sheets API (creation works, but it cannot be shared).
   */
  private async createViaOAuth(
    destination: DataDestination,
    title: string,
    requesterEmail: string | undefined
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
    // Drive-API create => isAppAuthorized => shareable under drive.file. Sheets-API
    // create does NOT reliably produce an app-authorized file, so permissions.create
    // on it would fail. Use Drive create only when the token actually has a Drive scope.
    const canShare = this.oauthTokenHasDriveScope(destination);
    // Folder placement is possible only with a Drive scope and a folder the user
    // granted via the Picker (drive.file gives access to picker-selected folders).
    const folderRequested = !!destination.config?.folderId?.trim();
    const folderId = canShare ? destination.config?.folderId?.trim() : undefined;
    let result: CreateGoogleSheetDocumentResponseDto;
    if (folderId) {
      try {
        result = await adapter.createSpreadsheetInFolder(title, folderId);
      } catch (error) {
        this.throwFolderCreateError(
          destination.id,
          error,
          'The selected Drive folder is not accessible with the connected Google account. Re-pick the folder while signed in with the connected account, or clear it to create the document in your Drive root.'
        );
      }
    } else {
      result = canShare
        ? await adapter.createSpreadsheetViaDrive(title)
        : await adapter.createSpreadsheet(title);
    }
    this.logger.log(
      `Auto-created Google Sheet ${result.spreadsheetId} via OAuth (driveCreate=${canShare}, folder=${folderId ?? 'root'}) for destination ${destination.id}`
    );

    const sharedWithRequester = await this.shareWithRequester(
      adapter,
      result.spreadsheetId,
      requesterEmail,
      { destinationId: destination.id, canShare }
    );
    // A folder was configured but we had to fall back to the Drive root because
    // the stored token lacks a Drive scope — surface it so the form can warn.
    const placedInRoot = folderRequested && !folderId;
    return { ...result, placedInRoot, sharedWithRequester };
  }

  /**
   * Service Account path: creates the file inside the destination's configured
   * shared Drive folder (Drive-scoped SA JWT), then shares it with the requester.
   */
  private async createViaServiceAccount(
    destination: DataDestination,
    title: string,
    requesterEmail: string | undefined
  ): Promise<CreateGoogleSheetDocumentResponseDto> {
    const folderId = destination.config?.folderId?.trim();
    if (!folderId) {
      throw new ServiceAccountRequiresFolderException(destination.id);
    }

    // Do NOT swallow resolver errors: a decryption/store failure is an
    // infrastructure fault and must surface, not be misreported as "not
    // configured". A wrong/missing key is still caught by the safeParse below.
    const resolved = await this.credentialsResolver.resolve(destination);
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
      this.throwFolderCreateError(
        destination.id,
        error,
        'Make sure it is a Shared Drive folder shared with the service account as a Content Manager.'
      );
    }
    this.logger.log(
      `Auto-created Google Sheet ${result.spreadsheetId} via Service Account in folder ${folderId} for destination ${destination.id}`
    );

    // SA JWT always carries the Drive scope, so sharing is always possible.
    const sharedWithRequester = await this.shareWithRequester(
      adapter,
      result.spreadsheetId,
      requesterEmail,
      { destinationId: destination.id, canShare: true }
    );
    // SA always places the file in the configured Shared Drive folder (or throws).
    return { ...result, placedInRoot: false, sharedWithRequester };
  }

  /**
   * Resolves the requesting user's email — from the command, or via the IDP by
   * userId when the auth context did not carry an email (e.g. API-key flows).
   */
  private async resolveRequesterEmail(
    command: CreateGoogleSheetDocumentCommand
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
   * Grants the requesting user writer access to the created document. Best-effort:
   * a sharing failure must NOT fail the (already successful) creation. Returns
   * whether the document was actually shared, so the response can tell the user.
   */
  private async shareWithRequester(
    adapter: GoogleSheetsApiAdapter,
    spreadsheetId: string,
    email: string | undefined,
    opts: { destinationId: string; canShare: boolean }
  ): Promise<boolean> {
    if (!email) {
      this.logger.warn(
        `Skipping share of ${spreadsheetId} (destination ${opts.destinationId}): could not resolve the requesting user's email.`
      );
      return false;
    }
    if (!opts.canShare) {
      this.logger.warn(
        `Skipping share of ${spreadsheetId} (destination ${opts.destinationId}) with ${email}: OAuth token lacks the drive.file scope. Reconnect the Google account to enable sharing.`
      );
      return false;
    }
    try {
      await adapter.shareFileWithUser(spreadsheetId, email, 'writer');
      this.logger.log(`Shared ${spreadsheetId} with ${email} (writer).`);
      return true;
    } catch (error) {
      this.logger.warn(
        `Best-effort share of ${spreadsheetId} with ${email} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return false;
    }
  }

  /** True when the destination's stored OAuth token already includes a Drive scope. */
  private oauthTokenHasDriveScope(destination: DataDestination): boolean {
    const credentials = destination.credential?.credentials as GoogleOAuthTokens | undefined;
    const scopes = credentials?.scope?.split(' ') ?? [];
    return scopes.includes(DRIVE_FILE_SCOPE) || scopes.includes(DRIVE_SCOPE);
  }

  /**
   * Reports a folder-create failure. A genuine access problem (403/404) or an
   * unknown status is surfaced as a 400 folder-config error with the path's
   * remediation hint. A transient Google fault (429/5xx) is surfaced as a 502
   * instead, so a temporary outage is not misreported as a misconfigured folder.
   * The original error is logged by the exception constructor either way.
   */
  private throwFolderCreateError(destinationId: string, error: unknown, hint: string): never {
    const status = GoogleSheetsApiAdapter.httpStatusOf(error);
    const isTransient = status === 429 || (status !== undefined && status >= 500);
    if (isTransient) {
      throw new GoogleApiException(
        'Google Drive is temporarily unavailable while creating the document. Please try again.',
        error
      );
    }
    throw new SheetFolderCreateFailedException(destinationId, error, hint);
  }
}
