import { Injectable, Logger } from '@nestjs/common';
import { GoogleAuth, Impersonated } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';

/**
 * Service for managing Google Cloud authentication and ID token generation.
 * Handles token caching and lifecycle management for service account impersonation.
 */
@Injectable()
export class ImpersonatedIdTokenService {
  private readonly logger = new Logger(ImpersonatedIdTokenService.name);
  private readonly auth = new GoogleAuth();

  // Cache fields
  private cachedIdToken: string;
  private idTokenExpiresAt: number = 0;
  private idTokenPromise: Promise<string> | null = null;

  /**
   * Returns a valid ID token for the specified service account and audience.
   * Uses caching to minimize token generation requests.
   *
   * @param serviceAccountEmail - Email of the service account to impersonate
   * @param targetAudience - Target audience for the ID token
   * @returns Valid ID token string
   * @throws Error if token generation fails
   */
  public async getIdToken(serviceAccountEmail: string, targetAudience: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    // 1. Check if we have a cached token that is valid for at least another 5 minutes
    if (this.cachedIdToken && this.idTokenExpiresAt > now + 300) {
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
   * Performs the actual token generation and updates the cache.
   *
   * @param serviceAccountEmail - Email of the service account to impersonate
   * @param targetAudience - Target audience for the ID token
   * @returns Generated ID token
   * @throws Error if token generation fails
   */
  private async fetchAndCacheIdToken(
    serviceAccountEmail: string,
    targetAudience: string
  ): Promise<string> {
    try {
      const authClient = await this.auth.getClient();

      const targetClient = new Impersonated({
        sourceClient: authClient,
        targetPrincipal: serviceAccountEmail,
        targetScopes: ['openid'],
        lifetime: 3600,
      });

      const token = await targetClient.fetchIdToken(targetAudience, {
        includeEmail: true,
      });

      // Update cache
      this.cachedIdToken = token;

      try {
        // Decode JWT to get expiration time
        const decoded = jwt.decode(token) as { exp: number };
        // Default to 10 min if exp is missing
        this.idTokenExpiresAt = decoded?.exp || Math.floor(Date.now() / 1000) + 600;
      } catch (decodeError) {
        this.logger.warn(
          `Failed to decode ID token expiration. Using default 10 min. Error: ${decodeError?.message || decodeError}`
        );
        this.idTokenExpiresAt = Math.floor(Date.now() / 1000) + 600;
      }

      return token;
    } catch (error) {
      this.logger.error(`Error generating ID token: ${error?.message || error}`);
      throw new Error(
        'Failed to generate ID token. Please check the service account configuration.'
      );
    }
  }
}
