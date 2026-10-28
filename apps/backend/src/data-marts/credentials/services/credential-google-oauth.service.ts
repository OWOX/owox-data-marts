import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import {
  CredentialsExpiredException,
  GoogleOAuthException,
  TokenRefreshFailedException,
} from '../../exceptions/google-oauth.exceptions';
import {
  GoogleOAuthConfigService,
  type GoogleOAuthClientConfig,
} from '../../services/google-oauth/google-oauth-config.service';
import {
  isInvalidRefreshTokenError,
  newGoogleOAuthClient,
} from '../../services/google-oauth/google-oauth.utils';
import type { CredentialSecret } from '../credential.types';
import type { Credential } from '../entities/credential.entity';
import { CredentialService } from './credential.service';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

type OAuthSecret = Extract<CredentialSecret, { oauth: unknown }>['oauth'];

/** Builds Google clients from a Credential's grant, with the OAuth client that issued it. */
@Injectable()
export class CredentialGoogleOAuthService {
  private readonly logger = new Logger(CredentialGoogleOAuthService.name);
  // Concurrent callers share one refresh, so Google is asked once per Credential.
  private readonly refreshLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly credentials: CredentialService,
    private readonly config: GoogleOAuthConfigService
  ) {}

  async getOAuth2Client(
    credentialId: string,
    { forceRefresh = false }: { forceRefresh?: boolean } = {}
  ): Promise<{ client: OAuth2Client; clientId: string }> {
    const { credential, oauth } = await this.load(credentialId);
    const issuer = this.config.getClientById(oauth.clientId);
    if (!issuer) {
      throw new GoogleOAuthException(
        'OAuth client is no longer configured.',
        'OAUTH_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    let { tokens } = oauth;
    if (
      forceRefresh ||
      (tokens.expiry_date && tokens.expiry_date < Date.now() + TOKEN_REFRESH_BUFFER_MS)
    ) {
      await this.refreshWithLock(credential, oauth, issuer);
      ({ tokens } = (await this.load(credentialId)).oauth);
    }

    const client = this.newClient(issuer);
    client.setCredentials(tokens);
    return { client, clientId: issuer.clientId };
  }

  private async load(id: string): Promise<{ credential: Credential; oauth: OAuthSecret }> {
    const credential = await this.credentials.findById(id);
    if (!credential || !('oauth' in credential.secret)) {
      throw new NotFoundException(`BigQuery Google account Credential ${id} was not found`);
    }
    return { credential, oauth: credential.secret.oauth };
  }

  private refreshWithLock(
    credential: Credential,
    oauth: OAuthSecret,
    issuer: GoogleOAuthClientConfig
  ): Promise<void> {
    const inFlight = this.refreshLocks.get(credential.id);
    if (inFlight) return inFlight;
    const refresh = this.refresh(credential, oauth, issuer).finally(() =>
      this.refreshLocks.delete(credential.id)
    );
    this.refreshLocks.set(credential.id, refresh);
    return refresh;
  }

  private async refresh(
    credential: Credential,
    oauth: OAuthSecret,
    issuer: GoogleOAuthClientConfig
  ): Promise<void> {
    const refreshToken = oauth.tokens.refresh_token;
    if (!refreshToken) return this.expire(credential);

    const client = this.newClient(issuer);
    client.setCredentials({ refresh_token: refreshToken });
    let fresh: Credentials;
    try {
      ({ credentials: fresh } = await client.refreshAccessToken());
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) return this.expire(credential);
      // The message only: the error object carries the request with the refresh token.
      this.logger.error(
        `Failed to refresh Google tokens for Credential ${credential.id}: ${castError(error).message}`
      );
      throw new TokenRefreshFailedException();
    }
    if (!fresh.access_token) throw new TokenRefreshFailedException();

    try {
      await this.credentials.saveRefreshedSecret(credential.id, credential, {
        oauth: {
          ...oauth,
          tokens: {
            ...oauth.tokens,
            access_token: fresh.access_token,
            refresh_token: fresh.refresh_token ?? refreshToken,
            expiry_date: fresh.expiry_date ?? undefined,
          },
        },
      });
    } catch (error) {
      // The message only: a failed query carries the new tokens in its parameters.
      this.logger.error(
        `Failed to save refreshed Google tokens for Credential ${credential.id}: ${castError(error).message}`
      );
      throw new TokenRefreshFailedException();
    }
  }

  /** Records the dead grant on the Credential so its consumers can say what to fix. */
  private async expire(credential: Credential): Promise<never> {
    const expired = new CredentialsExpiredException(credential.id, 'credential');
    try {
      // Guarded by modifiedAt, so a reconnect made meanwhile stays verified.
      await this.credentials.writeValidation(credential.id, credential, {
        state: 'rejected',
        message: expired.message,
        validatedAt: new Date(),
      });
    } catch (error) {
      // The grant is dead either way, so the caller still learns to reconnect.
      this.logger.error(
        `Failed to save the expired Google grant state for Credential ${credential.id}: ${castError(error).message}`
      );
    }
    throw expired;
  }

  private newClient(issuer: GoogleOAuthClientConfig): OAuth2Client {
    return newGoogleOAuthClient(issuer, this.config.getRedirectUri());
  }
}
