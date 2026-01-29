import { GoogleAuth, Impersonated } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { LoggerFactory } from '../logging/logger-factory.js';
import type { Logger } from '../logging/types.js';

type ImpersonatedIdTokenFetcherOptions = {
  logger?: Logger;
  authClient?: GoogleAuth;
  refreshBufferSeconds?: number;
};

/**
 * Retrieves and caches short-lived ID tokens via service account impersonation.
 * Built on Google IAM Service Account Impersonation. Renews the token when its
 * remaining lifetime is below the configured buffer.
 */
export class ImpersonatedIdTokenFetcher {
  private readonly logger: Logger;
  private readonly auth: GoogleAuth;
  private readonly refreshBufferSeconds: number;

  private cachedIdToken: string | undefined;
  private idTokenExpiresAt = 0;
  private idTokenPromise: Promise<string> | null = null;

  constructor(options?: ImpersonatedIdTokenFetcherOptions) {
    this.logger =
      options?.logger ?? LoggerFactory.createNamedLogger(ImpersonatedIdTokenFetcher.name);
    this.auth = options?.authClient ?? new GoogleAuth();
    this.refreshBufferSeconds = options?.refreshBufferSeconds ?? 300;
  }

  /**
   * Returns a valid ID token for the given service account and audience.
   * Uses in-memory cache and a shared promise to avoid parallel refreshes.
   *
   * @param serviceAccountEmail - Email of the service account to impersonate
   * @param targetAudience - Target audience (aud) for the ID token
   * @returns Valid ID token string
   * @throws Error if token generation fails
   */
  public async getIdToken(serviceAccountEmail: string, targetAudience: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    // 1. Check if we have a cached token that is valid for at least another buffer window
    if (this.cachedIdToken && this.idTokenExpiresAt > now + this.refreshBufferSeconds) {
      return this.cachedIdToken;
    }

    // 2. If a request is already in progress, return the existing promise
    if (this.idTokenPromise) {
      return this.idTokenPromise;
    }

    // 3. Start a new token fetch process
    this.idTokenPromise = this.fetchAndCacheIdToken(serviceAccountEmail, targetAudience);

    try {
      return await this.idTokenPromise;
    } finally {
      // Clear the promise so that future calls can trigger a new refresh if needed
      this.idTokenPromise = null;
    }
  }

  /**
   * Generates a new ID token via impersonation and updates the cache/expiry.
   * Throws an error with a safe message if generation fails.
   *
   * @param serviceAccountEmail - Email of the service account to impersonate
   * @param targetAudience - Target audience (aud) for the ID token
   * @returns Generated ID token
   * @throws Error if token generation fails
   */
  private async fetchAndCacheIdToken(
    serviceAccountEmail: string,
    targetAudience: string
  ): Promise<string> {
    try {
      const sourceClient = await this.auth.getClient();

      const targetClient = new Impersonated({
        sourceClient,
        targetPrincipal: serviceAccountEmail,
        targetScopes: ['openid'],
        lifetime: 3600,
      });

      const token = await targetClient.fetchIdToken(targetAudience, {
        includeEmail: true,
      });

      this.cachedIdToken = token;

      try {
        // Decode JWT to get expiration time
        const decoded = jwt.decode(token) as { exp?: number } | null;
        // Default to 10 min if exp is missing
        this.idTokenExpiresAt = decoded?.exp ?? Math.floor(Date.now() / 1000) + 600;
      } catch (decodeError) {
        const message = decodeError instanceof Error ? decodeError.message : String(decodeError);
        this.logger.warn(
          `[ImpersonatedIdTokenFetcher] Failed to decode ID token expiration. Using default 10 min. Error: ${message}`
        );
        this.idTokenExpiresAt = Math.floor(Date.now() / 1000) + 600;
      }

      return token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[ImpersonatedIdTokenFetcher] Error generating ID token: ${message}`);
      throw new Error(
        'Failed to generate ID token. Please check the service account configuration.'
      );
    }
  }
}
