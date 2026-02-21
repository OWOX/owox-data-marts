import { Injectable } from '@nestjs/common';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { GoogleOAuthFlowService } from './google-oauth-flow.service';
import { DataStorageCredentialService } from '../data-storage-credential.service';
import { DataDestinationCredentialService } from '../data-destination-credential.service';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataDestination } from '../../entities/data-destination.entity';
import { StorageCredentialType } from '../../enums/storage-credential-type.enum';
import { DestinationCredentialType } from '../../enums/destination-credential-type.enum';
import { CredentialsNotFoundException } from '../../exceptions/google-oauth.exceptions';

/**
 * Provides configured OAuth2Client instances for adapters.
 * Handles automatic token refresh before returning the client.
 */
@Injectable()
export class GoogleOAuthClientService {
  private readonly TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
  // Per-credential refresh locks to prevent concurrent thundering-herd refreshes
  private readonly refreshLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly googleOAuthConfigService: GoogleOAuthConfigService,
    private readonly googleOAuthFlowService: GoogleOAuthFlowService,
    private readonly dataStorageCredentialService: DataStorageCredentialService,
    private readonly dataDestinationCredentialService: DataDestinationCredentialService,
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    @InjectRepository(DataDestination)
    private readonly dataDestinationRepository: Repository<DataDestination>
  ) {}

  async getStorageOAuth2Client(storageId: string): Promise<OAuth2Client> {
    const storage = await this.dataStorageRepository.findOne({ where: { id: storageId } });
    if (!storage?.credentialId) {
      throw new CredentialsNotFoundException(storageId, 'storage');
    }

    let credential = await this.dataStorageCredentialService.getById(storage.credentialId);
    if (!credential || credential.type !== StorageCredentialType.GOOGLE_OAUTH) {
      throw new CredentialsNotFoundException(storageId, 'storage');
    }

    const expiryDate = (credential.credentials as { expiry_date?: number }).expiry_date;
    if (expiryDate && expiryDate < Date.now() + this.TOKEN_REFRESH_BUFFER_MS) {
      await this.refreshWithLock(credential.id, 'storage');
      credential = await this.dataStorageCredentialService.getById(credential.id);
      if (!credential) {
        throw new CredentialsNotFoundException(storageId, 'storage');
      }
    }

    return this.createOAuth2Client(credential.credentials, 'storage');
  }

  async getDestinationOAuth2Client(destinationId: string): Promise<OAuth2Client> {
    const destination = await this.dataDestinationRepository.findOne({
      where: { id: destinationId },
    });
    if (!destination?.credentialId) {
      throw new CredentialsNotFoundException(destinationId, 'destination');
    }

    return this.getDestinationOAuth2ClientByCredentialId(destination.credentialId);
  }

  async getDestinationOAuth2ClientByCredentialId(credentialId: string): Promise<OAuth2Client> {
    let credential = await this.dataDestinationCredentialService.getById(credentialId);
    if (!credential || credential.type !== DestinationCredentialType.GOOGLE_OAUTH) {
      throw new CredentialsNotFoundException(credentialId, 'destination');
    }

    const expiryDate = (credential.credentials as { expiry_date?: number }).expiry_date;
    if (expiryDate && expiryDate < Date.now() + this.TOKEN_REFRESH_BUFFER_MS) {
      await this.refreshWithLock(credential.id, 'destination');
      credential = await this.dataDestinationCredentialService.getById(credential.id);
      if (!credential) {
        throw new CredentialsNotFoundException(credentialId, 'destination');
      }
    }

    return this.createOAuth2Client(credential.credentials, 'destination');
  }

  /**
   * Serializes token refresh per credential ID.
   * Concurrent callers for the same credential await the single in-flight refresh
   * instead of all triggering separate Google API calls, which could invalidate tokens
   * if Google rotates the refresh token.
   */
  private async refreshWithLock(
    credentialId: string,
    type: 'storage' | 'destination'
  ): Promise<void> {
    const existing = this.refreshLocks.get(credentialId);
    if (existing) {
      return existing;
    }
    const refreshPromise = this.googleOAuthFlowService
      .refreshTokensByCredentialId(credentialId, type)
      .finally(() => {
        this.refreshLocks.delete(credentialId);
      });
    this.refreshLocks.set(credentialId, refreshPromise);
    return refreshPromise;
  }

  private createOAuth2Client(
    credentials: Record<string, unknown>,
    type: 'storage' | 'destination'
  ): OAuth2Client {
    const clientId =
      type === 'storage'
        ? this.googleOAuthConfigService.getStorageClientId()
        : this.googleOAuthConfigService.getDestinationClientId();
    const clientSecret =
      type === 'storage'
        ? this.googleOAuthConfigService.getStorageClientSecret()
        : this.googleOAuthConfigService.getDestinationClientSecret();
    const client = new OAuth2Client(
      clientId,
      clientSecret,
      this.googleOAuthConfigService.getRedirectUri()
    );
    client.setCredentials(credentials as Credentials);
    return client;
  }
}
