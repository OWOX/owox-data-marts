import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorageCredentials } from './data-storage-credentials.type';
import {
  BIGQUERY_OAUTH_TYPE,
  BigQueryOAuthCredentials,
} from './bigquery/schemas/bigquery-credentials.schema';
import { GoogleOAuthClientService } from '../services/google-oauth/google-oauth-client.service';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageCredential } from '../entities/data-storage-credential.entity';
import { DataStorageCredentialService } from '../services/data-storage-credential.service';

@Injectable()
export class DataStorageCredentialsResolver {
  constructor(
    private readonly googleOAuthClientService: GoogleOAuthClientService,
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly dataStorageCredentialService: DataStorageCredentialService
  ) {}

  async resolve(storage: DataStorage): Promise<DataStorageCredentials> {
    const credential = await this.loadCredential(storage);

    if (!credential) {
      throw new Error('Storage credentials are not configured');
    }

    if (credential.type === StorageCredentialType.GOOGLE_OAUTH) {
      const oauth2Client = await this.googleOAuthClientService.getStorageOAuth2Client(storage.id);
      return { type: BIGQUERY_OAUTH_TYPE, oauth2Client } satisfies BigQueryOAuthCredentials;
    }

    return credential.credentials as DataStorageCredentials;
  }

  async resolveById(storageId: string): Promise<DataStorageCredentials> {
    const storage = await this.dataStorageRepository.findOne({
      where: { id: storageId },
    });
    if (!storage) {
      throw new Error(`Storage not found: ${storageId}`);
    }
    return this.resolve(storage);
  }

  // Reads `storage.credential` populated by the eager OneToOne; if it's missing while
  // `credentialId` is set, refetches the credential explicitly. Guards against TypeORM
  // hydration glitches where eager + manual `relations` overlap can leave the field null
  // (observed after typeorm 0.3.29 / PR #11267 changed setValue to mergeDeep).
  private async loadCredential(storage: DataStorage): Promise<DataStorageCredential | null> {
    if (storage.credential) {
      return storage.credential;
    }
    if (!storage.credentialId) {
      return null;
    }
    return this.dataStorageCredentialService.getById(storage.credentialId);
  }
}
