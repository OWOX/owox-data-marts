import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { DataStorageCredentialService } from '../data-storage-credential.service';
import { DataDestinationCredentialService } from '../data-destination-credential.service';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataDestination } from '../../entities/data-destination.entity';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import type { StoredStorageCredentials } from '../../entities/stored-storage-credentials.type';
import type { StoredDestinationCredentials } from '../../entities/stored-destination-credentials.type';
import {
  OAuthNotConfiguredException,
  InvalidOAuthStateException,
  TokenExchangeFailedException,
  TokenRefreshFailedException,
  CredentialsNotFoundException,
  CredentialsExpiredException,
  GoogleApiException,
} from '../../exceptions/google-oauth.exceptions';

export type OAuthResourceType = 'storage' | 'destination';

export interface GoogleOAuthUser {
  id?: string;
  name?: string;
  email?: string;
  picture?: string;
}

export interface GoogleOAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  scope: string;
  expiry_date?: number;
}

export interface GoogleAuthorizationUrlResult {
  authorizationUrl: string;
  state: string;
}

export interface GoogleTokenExchangeResult {
  credentialId: string;
  user?: GoogleOAuthUser;
}

export interface GoogleOAuthSettingsResult {
  available: boolean;
  authorizationEndpoint?: string;
  clientId?: string;
  redirectUri?: string;
  availableScopes?: string[];
}

interface StateTokenPayload {
  projectId: string;
  resourceId?: string;
  type: OAuthResourceType;
  redirectUri: string;
}

@Injectable()
export class GoogleOAuthFlowService {
  private readonly logger = new Logger(GoogleOAuthFlowService.name);
  // Lazy-initialized separate clients per resource type
  private _storageOAuth2Client: OAuth2Client | null = null;
  private _destinationOAuth2Client: OAuth2Client | null = null;

  constructor(
    private readonly dataStorageCredentialService: DataStorageCredentialService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly googleOAuthConfigService: GoogleOAuthConfigService,
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>
  ) {}

  private getOAuth2Client(type: OAuthResourceType): OAuth2Client {
    if (type === 'storage') {
      if (!this._storageOAuth2Client) {
        if (!this.googleOAuthConfigService.isStorageConfigured()) {
          throw new OAuthNotConfiguredException();
        }
        this._storageOAuth2Client = new OAuth2Client(
          this.googleOAuthConfigService.getStorageClientId(),
          this.googleOAuthConfigService.getStorageClientSecret(),
          this.googleOAuthConfigService.getRedirectUri()
        );
      }
      return this._storageOAuth2Client;
    } else {
      if (!this._destinationOAuth2Client) {
        if (!this.googleOAuthConfigService.isDestinationConfigured()) {
          throw new OAuthNotConfiguredException();
        }
        this._destinationOAuth2Client = new OAuth2Client(
          this.googleOAuthConfigService.getDestinationClientId(),
          this.googleOAuthConfigService.getDestinationClientSecret(),
          this.googleOAuthConfigService.getRedirectUri()
        );
      }
      return this._destinationOAuth2Client;
    }
  }

  getSettingsForType(type: OAuthResourceType): GoogleOAuthSettingsResult {
    if (type === 'storage') {
      if (!this.googleOAuthConfigService.isStorageConfigured()) {
        return { available: false };
      }
      return {
        available: true,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: this.googleOAuthConfigService.getStorageClientId(),
        redirectUri: this.googleOAuthConfigService.getRedirectUri(),
        availableScopes: this.googleOAuthConfigService.getBigQueryScopes(),
      };
    } else {
      if (!this.googleOAuthConfigService.isDestinationConfigured()) {
        return { available: false };
      }
      return {
        available: true,
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        clientId: this.googleOAuthConfigService.getDestinationClientId(),
        redirectUri: this.googleOAuthConfigService.getRedirectUri(),
        availableScopes: this.googleOAuthConfigService.getSheetsScopes(),
      };
    }
  }

  async generateAuthorizationUrl(
    type: OAuthResourceType,
    projectId: string,
    resourceId: string | undefined,
    redirectUri: string
  ): Promise<GoogleAuthorizationUrlResult> {
    const configuredRedirectUri = this.googleOAuthConfigService.getRedirectUri();
    if (redirectUri !== configuredRedirectUri) {
      throw new BadRequestException(
        'Invalid redirect URI. Must match the configured OAuth redirect URI.'
      );
    }

    const state = this.generateStateToken({ projectId, resourceId, type, redirectUri });

    const scopes =
      type === 'storage'
        ? this.googleOAuthConfigService.getBigQueryScopes()
        : this.googleOAuthConfigService.getSheetsScopes();

    const authorizationUrl = this.getOAuth2Client(type).generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state,
      redirect_uri: redirectUri,
      prompt: 'consent',
    });

    return { authorizationUrl, state };
  }

  async exchangeAuthorizationCode(
    code: string,
    state: string,
    userId: string,
    callerProjectId: string
  ): Promise<GoogleTokenExchangeResult> {
    const statePayload = this.validateStateToken(state);

    if (statePayload.projectId !== callerProjectId) {
      throw new ForbiddenException('OAuth state does not belong to your project');
    }

    let tokens: GoogleOAuthTokens;
    try {
      const { tokens: googleTokens } = await this.getOAuth2Client(statePayload.type).getToken({
        code,
        redirect_uri: statePayload.redirectUri,
      });
      tokens = googleTokens as GoogleOAuthTokens;
    } catch (error) {
      this.logger.error('Failed to exchange authorization code', error);
      throw new TokenExchangeFailedException(
        'Failed to exchange authorization code for tokens',
        error
      );
    }

    if (!tokens.access_token) {
      throw new TokenExchangeFailedException('Token exchange returned no access_token');
    }

    let user: GoogleOAuthUser = {};
    try {
      user = await this.fetchUserInfo(tokens.access_token);
    } catch (error) {
      this.logger.warn(
        'Could not fetch user info, continuing without it',
        error instanceof Error ? error.message : String(error)
      );
    }

    const identity =
      user.email || user.name
        ? { email: user.email, name: user.name, picture: user.picture }
        : null;

    if (statePayload.type === 'storage') {
      const credential = await this.dataStorageCredentialService.create({
        projectId: statePayload.projectId,
        createdById: userId,
        type: StorageCredentialType.GOOGLE_OAUTH,
        credentials: tokens,
        identity,
      });

      if (statePayload.resourceId) {
        await this.dataStorageRepository.update(
          { id: statePayload.resourceId },
          { credentialId: credential.id }
        );
      }

      return { credentialId: credential.id, user };
    } else {
      const credential = await this.dataDestinationCredentialService.create({
        projectId: statePayload.projectId,
        createdById: userId,
        type: DestinationCredentialType.GOOGLE_OAUTH,
        credentials: tokens,
        identity,
      });

      if (statePayload.resourceId) {
        await this.dataDestinationRepository.update(
          { id: statePayload.resourceId },
          { credentialId: credential.id }
        );
      }

      return { credentialId: credential.id, user };
    }
  }

  async refreshTokensByCredentialId(credentialId: string, type: OAuthResourceType): Promise<void> {
    const credential =
      type === 'storage'
        ? await this.dataStorageCredentialService.getById(credentialId)
        : await this.dataDestinationCredentialService.getById(credentialId);

    if (!credential) {
      throw new CredentialsNotFoundException(credentialId, type);
    }

    const refreshToken = (credential.credentials as GoogleOAuthTokens).refresh_token;
    if (!refreshToken) {
      throw new CredentialsExpiredException(credentialId, type);
    }

    try {
      // Use the type-specific client_id/secret so tokens can be refreshed correctly
      const clientId =
        type === 'storage'
          ? this.googleOAuthConfigService.getStorageClientId()
          : this.googleOAuthConfigService.getDestinationClientId();
      const clientSecret =
        type === 'storage'
          ? this.googleOAuthConfigService.getStorageClientSecret()
          : this.googleOAuthConfigService.getDestinationClientSecret();

      // Create a per-call transient client to avoid mutating shared singleton state
      // across concurrent refresh calls, which would cause credential cross-contamination.
      const refreshClient = new OAuth2Client(
        clientId,
        clientSecret,
        this.googleOAuthConfigService.getRedirectUri()
      );
      refreshClient.setCredentials({ refresh_token: refreshToken });
      const { credentials: newTokens } = await refreshClient.refreshAccessToken();

      const currentTokens = credential.credentials as GoogleOAuthTokens;
      const updatedTokens: GoogleOAuthTokens = {
        ...currentTokens,
        access_token: newTokens.access_token!,
        expiry_date: newTokens.expiry_date ?? undefined,
      };

      const service =
        type === 'storage'
          ? this.dataStorageCredentialService
          : this.dataDestinationCredentialService;

      await service.update(credential.id, { credentials: updatedTokens });
      this.logger.log(`Refreshed OAuth tokens for ${type} credential ${credentialId}`);
    } catch (error) {
      this.logger.error(`Failed to refresh tokens for ${type} credential ${credentialId}`, error);
      throw new TokenRefreshFailedException('Failed to refresh OAuth tokens', error);
    }
  }

  // Legacy methods — delegate to new unified method
  async refreshStorageTokens(storageId: string): Promise<void> {
    const storage = await this.dataStorageRepository.findOne({ where: { id: storageId } });
    if (!storage?.credentialId) {
      throw new CredentialsNotFoundException(storageId, 'storage');
    }
    await this.refreshTokensByCredentialId(storage.credentialId, 'storage');
  }

  async refreshDestinationTokens(destinationId: string): Promise<void> {
    const destination = await this.dataDestinationRepository.findOne({
      where: { id: destinationId },
    });
    if (!destination?.credentialId) {
      throw new CredentialsNotFoundException(destinationId, 'destination');
    }
    await this.refreshTokensByCredentialId(destination.credentialId, 'destination');
  }

  async revokeStorageOAuth(storageId: string): Promise<void> {
    const storage = await this.dataStorageRepository.findOne({ where: { id: storageId } });
    if (!storage?.credentialId) {
      throw new CredentialsNotFoundException(storageId, 'storage');
    }
    await this.revokeCredential(storage.credentialId, 'storage');
    await this.dataStorageRepository.update({ id: storageId }, { credentialId: null });
    this.logger.log(`Revoked OAuth credentials for storage ${storageId}`);
  }

  async revokeDestinationOAuth(destinationId: string): Promise<void> {
    const destination = await this.dataDestinationRepository.findOne({
      where: { id: destinationId },
    });
    if (!destination?.credentialId) {
      throw new CredentialsNotFoundException(destinationId, 'destination');
    }
    await this.revokeCredential(destination.credentialId, 'destination');
    await this.dataDestinationRepository.update({ id: destinationId }, { credentialId: null });
    this.logger.log(`Revoked OAuth credentials for destination ${destinationId}`);
  }

  async isStorageOAuthValid(storageId: string): Promise<boolean> {
    const storage = await this.dataStorageRepository.findOne({ where: { id: storageId } });
    if (!storage?.credentialId) return false;
    const credential = await this.dataStorageCredentialService.getById(storage.credentialId);
    return this.isCredentialValid(credential);
  }

  async isDestinationOAuthValid(destinationId: string): Promise<boolean> {
    const destination = await this.dataDestinationRepository.findOne({
      where: { id: destinationId },
    });
    if (!destination?.credentialId) return false;
    const credential = await this.dataDestinationCredentialService.getById(
      destination.credentialId
    );
    return this.isCredentialValid(credential);
  }

  // Private helpers

  private isCredentialValid(
    credential: { credentials: StoredStorageCredentials | StoredDestinationCredentials } | null
  ): boolean {
    if (!credential) return false;
    return !!(credential.credentials as GoogleOAuthTokens).refresh_token;
  }

  private async revokeCredential(credentialId: string, type: OAuthResourceType): Promise<void> {
    const credService =
      type === 'storage'
        ? this.dataStorageCredentialService
        : this.dataDestinationCredentialService;

    const credential = await credService.getById(credentialId);
    if (credential) {
      try {
        const tokens = credential.credentials as GoogleOAuthTokens;
        // Prefer revoking refresh_token (invalidates all associated access tokens).
        // Fall back to access_token if no refresh_token is available.
        const tokenToRevoke = tokens.refresh_token || tokens.access_token;
        if (tokenToRevoke) {
          // Create a transient client to avoid mutating shared singleton state
          const clientId =
            type === 'storage'
              ? this.googleOAuthConfigService.getStorageClientId()
              : this.googleOAuthConfigService.getDestinationClientId();
          const clientSecret =
            type === 'storage'
              ? this.googleOAuthConfigService.getStorageClientSecret()
              : this.googleOAuthConfigService.getDestinationClientSecret();
          const revokeClient = new OAuth2Client(
            clientId,
            clientSecret,
            this.googleOAuthConfigService.getRedirectUri()
          );
          await revokeClient.revokeToken(tokenToRevoke);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to revoke token with Google for ${type} credential ${credentialId}`,
          error
        );
      }
      await credService.softDelete(credentialId);
    }
  }

  private async fetchUserInfo(accessToken: string): Promise<GoogleOAuthUser> {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user info: ${response.statusText}`);
      }

      const data = await response.json();
      return { id: data.id, name: data.name, email: data.email, picture: data.picture };
    } catch (error) {
      this.logger.error('Failed to fetch user info from Google', error);
      throw new GoogleApiException('Failed to fetch user information', error);
    }
  }

  private generateStateToken(payload: StateTokenPayload): string {
    const jwtSecret = this.googleOAuthConfigService.getJwtSecret();
    return jwt.sign(payload, jwtSecret, { expiresIn: 600 });
  }

  private validateStateToken(state: string): StateTokenPayload {
    try {
      const jwtSecret = this.googleOAuthConfigService.getJwtSecret();
      return jwt.verify(state, jwtSecret) as StateTokenPayload;
    } catch (error) {
      this.logger.error('Failed to validate state token', error);
      throw new InvalidOAuthStateException(error);
    }
  }
}
