import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { castError } from '@owox/internal-helpers';
import type { OAuth2Client } from 'google-auth-library';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { DataStorageCredentialService } from '../data-storage-credential.service';
import { DataDestinationCredentialService } from '../data-destination-credential.service';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { DataDestination } from '../../entities/data-destination.entity';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import type { StoredStorageCredentials } from '../../entities/stored-storage-credentials.type';
import type { StoredDestinationCredentials } from '../../entities/stored-destination-credentials.type';
import type { CredentialOAuthAuth, GoogleOAuthClientKey } from '../../credentials/credential.types';
import {
  GOOGLE_OAUTH_DEFINITION_ID,
  builtinOAuthAuth,
} from '../../credentials/services/builtin-credential-definitions';
import { isInvalidRefreshTokenError, newGoogleOAuthClient } from './google-oauth.utils';
import {
  InvalidOAuthStateException,
  TokenExchangeFailedException,
  TokenRefreshFailedException,
  CredentialsNotFoundException,
  CredentialsExpiredException,
  GoogleApiException,
} from '../../exceptions/google-oauth.exceptions';

// Legacy: no caller issues 'storage' any more; remove it with LegacyStorageCredentialReader.
/** A Credential is authorized with the client and scopes of its definition. */
export type OAuthResourceType = 'storage' | 'destination' | 'credential';

type GoogleOAuthTarget = Pick<CredentialOAuthAuth, 'client' | 'scopes'>;

const DESTINATION_TARGET: GoogleOAuthTarget = { client: 'destination', scopes: 'sheets' };

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
  /** Drive Picker API key (destination only) — lets the FE open the folder picker. */
  pickerApiKey?: string;
}

export interface StateTokenPayload {
  projectId: string;
  resourceId?: string;
  type: OAuthResourceType;
  redirectUri: string;
  /** The definition of the Credential a 'credential' grant connects. */
  definitionId?: string;
}

export interface GoogleOAuthGrant {
  state: StateTokenPayload;
  tokens: GoogleOAuthTokens;
  user: GoogleOAuthUser;
  /** The OAuth client that issued the tokens; only it can refresh or revoke them. */
  clientId: string;
}

@Injectable()
export class GoogleOAuthFlowService {
  private readonly logger = new Logger(GoogleOAuthFlowService.name);
  // Lazy-initialized, one per configured OAuth client
  private readonly oauth2Clients = new Map<GoogleOAuthClientKey, OAuth2Client>();

  constructor(
    private readonly dataStorageCredentialService: DataStorageCredentialService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    private readonly googleOAuthConfigService: GoogleOAuthConfigService,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>
  ) {}

  private getOAuth2Client(client: GoogleOAuthClientKey): OAuth2Client {
    let oauth2Client = this.oauth2Clients.get(client);
    if (!oauth2Client) {
      oauth2Client = newGoogleOAuthClient(
        this.googleOAuthConfigService.getClient(client),
        this.googleOAuthConfigService.getRedirectUri()
      );
      this.oauth2Clients.set(client, oauth2Client);
    }
    return oauth2Client;
  }

  /** The destination's client and scopes, or those of the Credential definition. */
  private target(type: OAuthResourceType, definitionId: string): GoogleOAuthTarget {
    if (type === 'destination') return DESTINATION_TARGET;
    const auth = builtinOAuthAuth(definitionId);
    if (!auth) {
      throw new BadRequestException(
        `Credential definition ${definitionId} does not connect a Google account.`
      );
    }
    return auth;
  }

  getSettingsForType(type: OAuthResourceType): GoogleOAuthSettingsResult {
    const { client, scopes } = this.target(type, GOOGLE_OAUTH_DEFINITION_ID);
    if (!this.googleOAuthConfigService.isClientConfigured(client)) {
      return { available: false };
    }
    return {
      available: true,
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      clientId: this.googleOAuthConfigService.getClient(client).clientId,
      redirectUri: this.googleOAuthConfigService.getRedirectUri(),
      availableScopes: this.googleOAuthConfigService.getScopes(scopes),
      ...(type === 'destination'
        ? { pickerApiKey: this.googleOAuthConfigService.getPickerApiKey() }
        : {}),
    };
  }

  async generateAuthorizationUrl(
    type: OAuthResourceType,
    projectId: string,
    resourceId: string | undefined,
    redirectUri: string,
    definitionId = GOOGLE_OAUTH_DEFINITION_ID
  ): Promise<GoogleAuthorizationUrlResult> {
    const configuredRedirectUri = this.googleOAuthConfigService.getRedirectUri();
    if (redirectUri !== configuredRedirectUri) {
      throw new BadRequestException(
        'Invalid redirect URI. Must match the configured OAuth redirect URI.'
      );
    }

    const { client, scopes } = this.target(type, definitionId);
    const state = this.generateStateToken({
      projectId,
      resourceId,
      type,
      redirectUri,
      ...(type === 'destination' ? {} : { definitionId }),
    });

    const authorizationUrl = this.getOAuth2Client(client).generateAuthUrl({
      access_type: 'offline',
      scope: this.googleOAuthConfigService.getScopes(scopes),
      state,
      redirect_uri: redirectUri,
      prompt: 'consent',
    });

    return { authorizationUrl, state };
  }

  /** Exchanges the code and reads the account; the caller decides what to store. */
  async exchangeCodeForGrant(
    code: string,
    state: string,
    callerProjectId: string
  ): Promise<GoogleOAuthGrant> {
    const statePayload = this.validateStateToken(state);

    if (statePayload.projectId !== callerProjectId) {
      throw new ForbiddenException('OAuth state does not belong to your project');
    }

    // Checked before the code is spent: the Credential connect refuses such a state anyway.
    if (statePayload.type === 'credential' && !statePayload.definitionId) {
      throw new InvalidOAuthStateException();
    }
    const { client } = this.target(
      statePayload.type,
      // Destination states and legacy Storage states carry no definition.
      statePayload.definitionId ?? GOOGLE_OAUTH_DEFINITION_ID
    );
    let tokens: GoogleOAuthTokens;
    try {
      const { tokens: googleTokens } = await this.getOAuth2Client(client).getToken({
        code,
        redirect_uri: statePayload.redirectUri,
      });
      tokens = googleTokens as GoogleOAuthTokens;
    } catch (error) {
      // The message only: the error object carries the request with the code and client secret.
      this.logger.error(`Failed to exchange authorization code: ${castError(error).message}`);
      throw new TokenExchangeFailedException('Failed to exchange authorization code for tokens');
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

    const { clientId } = this.googleOAuthConfigService.getClient(client);
    return { state: statePayload, tokens, user, clientId };
  }

  async exchangeAuthorizationCode(
    code: string,
    state: string,
    userId: string,
    callerProjectId: string
  ): Promise<GoogleTokenExchangeResult> {
    const {
      state: statePayload,
      tokens,
      user,
    } = await this.exchangeCodeForGrant(code, state, callerProjectId);
    // Storages and Credentials connect through the Credential exchange.
    if (statePayload.type !== 'destination') {
      throw new InvalidOAuthStateException();
    }

    const identity =
      user.email || user.name
        ? { email: user.email, name: user.name, picture: user.picture }
        : null;

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

  // Legacy: the 'storage' type refreshes old rows; remove it with LegacyStorageCredentialReader.
  async refreshTokensByCredentialId(
    credentialId: string,
    type: 'storage' | 'destination'
  ): Promise<void> {
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

    // Create a per-call transient client to avoid mutating shared singleton state
    // across concurrent refresh calls, which would cause credential cross-contamination.
    const refreshClient = newGoogleOAuthClient(
      this.googleOAuthConfigService.getClient(type),
      this.googleOAuthConfigService.getRedirectUri()
    );
    refreshClient.setCredentials({ refresh_token: refreshToken });

    let newTokens: { access_token?: string | null; expiry_date?: number | null };
    try {
      const tokenResponse = await refreshClient.refreshAccessToken();
      newTokens = tokenResponse.credentials;
    } catch (error) {
      if (isInvalidRefreshTokenError(error)) {
        this.logger.warn(`Refresh token is no longer valid for ${type} credential ${credentialId}`);
        throw new CredentialsExpiredException(credentialId, type);
      }

      // The message only: the error object carries the request with the refresh token.
      this.logger.error(
        `Failed to refresh tokens for ${type} credential ${credentialId}: ${castError(error).message}`
      );
      throw new TokenRefreshFailedException();
    }

    if (!newTokens.access_token) {
      this.logger.error(
        `Refresh response missing access_token for ${type} credential ${credentialId}`
      );
      throw new TokenRefreshFailedException();
    }

    const currentTokens = credential.credentials as GoogleOAuthTokens;
    const updatedTokens: GoogleOAuthTokens = {
      ...currentTokens,
      access_token: newTokens.access_token,
      expiry_date: newTokens.expiry_date ?? undefined,
    };

    const service =
      type === 'storage'
        ? this.dataStorageCredentialService
        : this.dataDestinationCredentialService;

    try {
      await service.update(credential.id, { credentials: updatedTokens });
      this.logger.log(`Refreshed OAuth tokens for ${type} credential ${credentialId}`);
    } catch (error) {
      this.logger.error(
        `Failed to save refreshed tokens for ${type} credential ${credentialId}: ${castError(error).message}`
      );
      throw new TokenRefreshFailedException(
        'Google access was refreshed, but the updated tokens could not be saved. Please try again later.'
      );
    }
  }

  // Legacy methods — delegate to new unified method
  async refreshDestinationTokens(destinationId: string): Promise<void> {
    const destination = await this.dataDestinationRepository.findOne({
      where: { id: destinationId },
    });
    if (!destination?.credentialId) {
      throw new CredentialsNotFoundException(destinationId, 'destination');
    }
    await this.refreshTokensByCredentialId(destination.credentialId, 'destination');
  }

  async revokeDestinationOAuth(destinationId: string): Promise<void> {
    const destination = await this.dataDestinationRepository.findOne({
      where: { id: destinationId },
    });
    if (!destination?.credentialId) {
      throw new CredentialsNotFoundException(destinationId, 'destination');
    }
    await this.revokeCredential(destination.credentialId, 'destination');
    // Also clear the Drive folder config: an OAuth-selected folder's drive.file
    // grant was tied to the now-revoked account, so it would be stale (and could
    // point at a folder the next-connected account cannot access).
    await this.dataDestinationRepository.update(
      { id: destinationId },
      { credentialId: null, config: null }
    );
    this.logger.log(`Revoked OAuth credentials for destination ${destinationId}`);
  }

  async isDestinationOAuthValid(destinationId: string): Promise<boolean> {
    const destination = await this.dataDestinationRepository.findOne({
      where: { id: destinationId },
    });
    if (!destination?.credential) return false;
    return this.isCredentialValid(destination.credential);
  }

  // Private helpers

  private isCredentialValid(
    credential: { credentials: StoredStorageCredentials | StoredDestinationCredentials } | null
  ): boolean {
    if (!credential) return false;
    return !!(credential.credentials as GoogleOAuthTokens).refresh_token;
  }

  // Legacy: the 'storage' type revokes old rows; remove it with LegacyStorageCredentialReader.
  private async revokeCredential(
    credentialId: string,
    type: 'storage' | 'destination'
  ): Promise<void> {
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
          const revokeClient = newGoogleOAuthClient(
            this.googleOAuthConfigService.getClient(type),
            this.googleOAuthConfigService.getRedirectUri()
          );
          await revokeClient.revokeToken(tokenToRevoke);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to revoke token with Google for ${type} credential ${credentialId}: ${castError(error).message}`
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
      this.logger.error(`Failed to fetch user info from Google: ${castError(error).message}`);
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
