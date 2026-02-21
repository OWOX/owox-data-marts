import { Injectable, Logger } from '@nestjs/common';
import { DataStorageCredentials } from './data-storage-credentials.type';
import {
  BIGQUERY_OAUTH_TYPE,
  BigQueryOAuthCredentials,
} from './bigquery/schemas/bigquery-credentials.schema';
import { GoogleOAuthClientService } from '../services/google-oauth/google-oauth-client.service';
import { DataStorageCredentialService } from '../services/data-storage-credential.service';
import { StorageCredentialType } from '../enums/storage-credential-type.enum';
import { DataStorage } from '../entities/data-storage.entity';

@Injectable()
export class DataStorageCredentialsResolver {
  private readonly logger = new Logger(DataStorageCredentialsResolver.name);

  constructor(
    private readonly googleOAuthClientService: GoogleOAuthClientService,
    private readonly dataStorageCredentialService: DataStorageCredentialService
  ) {}

  async resolve(storage: DataStorage): Promise<DataStorageCredentials> {
    if (storage.credentialId) {
      const credential = await this.dataStorageCredentialService.getById(storage.credentialId);
      if (!credential) {
        this.logger.error(`Credential record not found: ${storage.credentialId}`);
        throw new Error(`Credential record not found: ${storage.credentialId}`);
      }

      if (credential.type === StorageCredentialType.GOOGLE_OAUTH) {
        const oauth2Client = await this.googleOAuthClientService.getStorageOAuth2Client(storage.id);
        return { type: BIGQUERY_OAUTH_TYPE, oauth2Client } satisfies BigQueryOAuthCredentials;
      }

      return credential.credentials as DataStorageCredentials;
    }

    throw new Error('Storage credentials are not configured');
  }
}
