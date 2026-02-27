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
        this.logger.error(
          `OAuth not available for destination ${destinationId}, falling back: ${error.message}`
        );
      }
    }

    if (!credentials) {
      return undefined;
    }

    this.logger.debug(`Creating Google Sheets adapter with Service Account`);
    return new GoogleSheetsApiAdapter(credentials);
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
    return this.createWithOAuth(parsed.success ? parsed.data : undefined, destination.id);
  }
}
