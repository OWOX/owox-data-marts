import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

/**
 * Zod schema for a single OAuth client (storage or destination)
 */
const GoogleOAuthClientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

/**
 * Zod schema for shared OAuth configuration
 */
const GoogleOAuthSharedSchema = z.object({
  redirectUri: z.string().url('GOOGLE_OAUTH_REDIRECT_URI must be a valid URL'),
  jwtSecret: z.string().min(1, 'GOOGLE_OAUTH_JWT_SECRET is required'),
  bigQueryScopes: z
    .array(z.string())
    .default(['https://www.googleapis.com/auth/bigquery', 'openid', 'email', 'profile']),
  sheetsScopes: z
    .array(z.string())
    .default(['https://www.googleapis.com/auth/spreadsheets', 'openid', 'email', 'profile']),
});

export type GoogleOAuthClientConfig = z.infer<typeof GoogleOAuthClientSchema>;
export type GoogleOAuthSharedConfig = z.infer<typeof GoogleOAuthSharedSchema>;

/**
 * Configuration service for Google OAuth
 *
 * Supports separate OAuth apps for storage (BigQuery) and destination (Google Sheets):
 * - GOOGLE_OAUTH_STORAGE_CLIENT_ID / GOOGLE_OAUTH_STORAGE_CLIENT_SECRET
 * - GOOGLE_OAUTH_DESTINATION_CLIENT_ID / GOOGLE_OAUTH_DESTINATION_CLIENT_SECRET
 * - GOOGLE_OAUTH_REDIRECT_URI (shared)
 * - GOOGLE_OAUTH_JWT_SECRET (shared)
 *
 * Each resource type is independently optional.
 * Shared config (redirect URI, JWT secret) is required if at least one is configured.
 */
@Injectable()
export class GoogleOAuthConfigService {
  private readonly logger = new Logger(GoogleOAuthConfigService.name);
  private storageConfig: GoogleOAuthClientConfig | null = null;
  private destinationConfig: GoogleOAuthClientConfig | null = null;
  private sharedConfig: GoogleOAuthSharedConfig | null = null;

  constructor(private readonly configService: ConfigService) {
    const storageClientId = this.configService.get<string>('GOOGLE_OAUTH_STORAGE_CLIENT_ID');
    const storageClientSecret = this.configService.get<string>(
      'GOOGLE_OAUTH_STORAGE_CLIENT_SECRET'
    );
    const destinationClientId = this.configService.get<string>(
      'GOOGLE_OAUTH_DESTINATION_CLIENT_ID'
    );
    const destinationClientSecret = this.configService.get<string>(
      'GOOGLE_OAUTH_DESTINATION_CLIENT_SECRET'
    );
    const redirectUri = this.configService.get<string>('GOOGLE_OAUTH_REDIRECT_URI');
    const jwtSecret = this.configService.get<string>('GOOGLE_OAUTH_JWT_SECRET');

    const hasStorage = !!(storageClientId && storageClientSecret);
    const hasDestination = !!(destinationClientId && destinationClientSecret);

    if (!hasStorage && !hasDestination) {
      this.logger.warn(
        'Google OAuth not configured. OAuth features will be disabled. ' +
          'Set GOOGLE_OAUTH_STORAGE_CLIENT_ID/SECRET and/or ' +
          'GOOGLE_OAUTH_DESTINATION_CLIENT_ID/SECRET to enable.'
      );
      return;
    }

    if (!redirectUri || !jwtSecret) {
      this.logger.warn(
        'Google OAuth partially configured: GOOGLE_OAUTH_REDIRECT_URI and GOOGLE_OAUTH_JWT_SECRET ' +
          'are required when any OAuth client is configured. OAuth features will be disabled.'
      );
      return;
    }

    try {
      const bigQueryScopesStr = this.configService.get<string>('GOOGLE_OAUTH_BIGQUERY_SCOPE');
      const bigQueryScopes = bigQueryScopesStr
        ? bigQueryScopesStr.split(',').map(s => s.trim())
        : undefined;

      const sheetsScopesStr = this.configService.get<string>('GOOGLE_OAUTH_SHEETS_SCOPE');
      const sheetsScopes = sheetsScopesStr
        ? sheetsScopesStr.split(',').map(s => s.trim())
        : undefined;

      this.sharedConfig = GoogleOAuthSharedSchema.parse({
        redirectUri,
        jwtSecret,
        bigQueryScopes,
        sheetsScopes,
      });

      if (hasStorage) {
        this.storageConfig = GoogleOAuthClientSchema.parse({
          clientId: storageClientId,
          clientSecret: storageClientSecret,
        });
        this.logger.log('Google OAuth for storage (BigQuery) configured successfully');
      }

      if (hasDestination) {
        this.destinationConfig = GoogleOAuthClientSchema.parse({
          clientId: destinationClientId,
          clientSecret: destinationClientSecret,
        });
        this.logger.log('Google OAuth for destination (Sheets) configured successfully');
      }
    } catch (error) {
      this.logger.error('Failed to parse Google OAuth configuration', error);
      throw error;
    }
  }

  isStorageConfigured(): boolean {
    return this.storageConfig !== null && this.sharedConfig !== null;
  }

  isDestinationConfigured(): boolean {
    return this.destinationConfig !== null && this.sharedConfig !== null;
  }

  /** True if at least one OAuth type is configured */
  isConfigured(): boolean {
    return this.isStorageConfigured() || this.isDestinationConfigured();
  }

  getStorageClientId(): string {
    this.ensureStorageConfigured();
    return this.storageConfig!.clientId;
  }

  getStorageClientSecret(): string {
    this.ensureStorageConfigured();
    return this.storageConfig!.clientSecret;
  }

  getDestinationClientId(): string {
    this.ensureDestinationConfigured();
    return this.destinationConfig!.clientId;
  }

  getDestinationClientSecret(): string {
    this.ensureDestinationConfigured();
    return this.destinationConfig!.clientSecret;
  }

  getRedirectUri(): string {
    this.ensureSharedConfigured();
    return this.sharedConfig!.redirectUri;
  }

  getJwtSecret(): string {
    this.ensureSharedConfigured();
    return this.sharedConfig!.jwtSecret;
  }

  getBigQueryScopes(): string[] {
    this.ensureStorageConfigured();
    return this.sharedConfig!.bigQueryScopes;
  }

  getSheetsScopes(): string[] {
    this.ensureDestinationConfigured();
    return this.sharedConfig!.sheetsScopes;
  }

  private ensureStorageConfigured(): void {
    if (!this.isStorageConfigured()) {
      throw new Error(
        'Google OAuth for storage is not configured. ' +
          'Set GOOGLE_OAUTH_STORAGE_CLIENT_ID, GOOGLE_OAUTH_STORAGE_CLIENT_SECRET, ' +
          'GOOGLE_OAUTH_REDIRECT_URI, and GOOGLE_OAUTH_JWT_SECRET.'
      );
    }
  }

  private ensureDestinationConfigured(): void {
    if (!this.isDestinationConfigured()) {
      throw new Error(
        'Google OAuth for destination is not configured. ' +
          'Set GOOGLE_OAUTH_DESTINATION_CLIENT_ID, GOOGLE_OAUTH_DESTINATION_CLIENT_SECRET, ' +
          'GOOGLE_OAUTH_REDIRECT_URI, and GOOGLE_OAUTH_JWT_SECRET.'
      );
    }
  }

  private ensureSharedConfigured(): void {
    if (!this.sharedConfig) {
      throw new Error('Google OAuth shared configuration is not available.');
    }
  }
}
