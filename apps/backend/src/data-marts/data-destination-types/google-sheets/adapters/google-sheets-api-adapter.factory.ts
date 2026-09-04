import { Injectable, Logger } from '@nestjs/common';
import { GoogleSheetsApiAdapter } from './google-sheets-api.adapter';
import {
  GoogleSheetsCredentials,
  GoogleSheetsCredentialsSchema,
} from '../schemas/google-sheets-credentials.schema';
import { GoogleOAuthClientService } from '../../../services/google-oauth/google-oauth-client.service';
import { DataDestinationCredentialsResolver } from '../../data-destination-credentials-resolver.service';
import { DataDestination } from '../../../entities/data-destination.entity';

@Injectable()
export class GoogleSheetsApiAdapterFactory {
  private readonly logger = new Logger(GoogleSheetsApiAdapterFactory.name);

  constructor(
    private readonly googleOAuthClientService: GoogleOAuthClientService,
    private readonly credentialsResolver: DataDestinationCredentialsResolver
  ) {}

  /**
   * Creates a new Google Sheets API adapter (synchronous, Service Account only)
   *
   * This is the legacy method for backward compatibility.
   * Does NOT support OAuth authentication.
   *
   * @param credentials - Google Sheets Service Account credentials
   * @returns A new Google Sheets API adapter instance
   */
  create(credentials: GoogleSheetsCredentials): GoogleSheetsApiAdapter {
    this.logger.debug(`Creating Google Sheets adapter with Service Account (sync)`);
    return new GoogleSheetsApiAdapter(credentials);
  }

  /**
   * Creates a new Google Sheets API adapter with OAuth support (async)
   *
   * Attempts to use OAuth2Client if destinationId is provided, falls back to Service Account JWT.
   *
   * @param credentials - Google Sheets Service Account credentials (used as fallback). Can be undefined for OAuth-only destinations.
   * @param destinationId - Optional Data Destination ID for OAuth lookup
   * @returns A new Google Sheets API adapter instance, or undefined if no auth method is available
   */
  async createWithOAuth(
    credentials: GoogleSheetsCredentials | undefined,
    destinationId?: string
  ): Promise<GoogleSheetsApiAdapter | undefined> {
    if (destinationId) {
      try {
        const oauth2Client =
          await this.googleOAuthClientService.getDestinationOAuth2Client(destinationId);

        if (oauth2Client) {
          return new GoogleSheetsApiAdapter(undefined, oauth2Client);
        }
      } catch (error) {
        this.logger.debug(
          `OAuth not available for destination ${destinationId}, falling back to SA: ${error.message}`
        );
      }
    }

    if (!credentials) {
      return undefined;
    }

    this.logger.debug(`Creating Google Sheets adapter with Service Account`);
    return new GoogleSheetsApiAdapter(credentials);
  }

  /**
   * Like {@link createFromDestination}, but for a caller that needs Drive
   * metadata (sharing, permissions) on top of Sheets operations. A Service
   * Account gets a separately minted Drive-scoped JWT — the narrow SHEETS_SCOPE
   * client used everywhere else is left untouched; an OAuth client is Drive-
   * capable only when the stored token was granted a Drive scope, which
   * `driveCapable` reports so the caller can degrade instead of failing.
   */
  async createWithDriveScope(
    destination: DataDestination
  ): Promise<{ adapter: GoogleSheetsApiAdapter; driveCapable: boolean } | undefined> {
    let resolvedCredentials: unknown;
    try {
      resolvedCredentials = await this.credentialsResolver.resolve(destination);
    } catch {
      this.logger.debug(`No credentials found for destination ${destination.id}, will try OAuth`);
    }
    const parsed = GoogleSheetsCredentialsSchema.safeParse(resolvedCredentials);
    if (parsed.success && parsed.data.serviceAccountKey) {
      const jwt = GoogleSheetsApiAdapter.createServiceAccountClient(
        parsed.data.serviceAccountKey,
        GoogleSheetsApiAdapter.SERVICE_ACCOUNT_DRIVE_CREATE_SCOPES
      );
      return { adapter: new GoogleSheetsApiAdapter(undefined, jwt), driveCapable: true };
    }
    const adapter = await this.createWithOAuth(undefined, destination.id);
    if (!adapter) {
      return undefined;
    }
    const scopes =
      (destination.credential?.credentials as { scope?: string } | undefined)?.scope?.split(' ') ??
      [];
    const driveCapable = scopes.some(
      scope =>
        scope === 'https://www.googleapis.com/auth/drive' ||
        scope === 'https://www.googleapis.com/auth/drive.file'
    );
    return { adapter, driveCapable };
  }

  async createFromDestination(
    destination: DataDestination
  ): Promise<GoogleSheetsApiAdapter | undefined> {
    let resolvedCredentials: unknown;
    try {
      resolvedCredentials = await this.credentialsResolver.resolve(destination);
    } catch {
      this.logger.debug(`No credentials found for destination ${destination.id}, will try OAuth`);
    }
    const parsed = GoogleSheetsCredentialsSchema.safeParse(resolvedCredentials);
    if (parsed.success) {
      return new GoogleSheetsApiAdapter(parsed.data);
    }
    return this.createWithOAuth(undefined, destination.id);
  }
}
