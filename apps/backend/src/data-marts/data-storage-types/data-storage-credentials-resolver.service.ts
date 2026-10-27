import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DataStorageCredentials } from './data-storage-credentials.type';
import {
  BIGQUERY_OAUTH_TYPE,
  BigQueryOAuthCredentials,
} from './bigquery/schemas/bigquery-credentials.schema';
import { DataStorage } from '../entities/data-storage.entity';
import { LegacyStorageCredentialReader } from '../services/storage-credential-conversion/legacy-storage-credential-reader.service';
import {
  StorageCredentialBindingService,
  type ResolvedStorageCredential,
} from './storage-credential-binding.service';
import type { StorageCredentialSummary } from './storage-credential-state';
import {
  CredentialsExpiredException,
  GoogleOAuthException,
} from '../exceptions/google-oauth.exceptions';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { toAdapterCredentials } from './storage-credential-definitions';

@Injectable()
export class DataStorageCredentialsResolver {
  constructor(
    @InjectRepository(DataStorage)
    private readonly dataStorageRepository: Repository<DataStorage>,
    private readonly storageCredentials: StorageCredentialBindingService,
    private readonly legacy: LegacyStorageCredentialReader
  ) {}

  /** True when the Storage has a bound Credential or an old credentials row. */
  async hasCredentials(storage: DataStorage): Promise<boolean> {
    if (this.legacy.hasOldKey(storage)) return true;
    const bound = await this.storageCredentials.findBoundStorageIds(storage.projectId, [
      storage.id,
    ]);
    return bound.has(storage.id);
  }

  /** Bound Storages' Credentials as the member sees them, `pending` for one on its old key. */
  async summarize(
    projectId: string,
    userId: string,
    roles: readonly string[],
    storages: readonly Pick<DataStorage, 'id' | 'type' | 'credentialId'>[]
  ): Promise<ReadonlyMap<string, StorageCredentialSummary>> {
    const summaries = new Map(
      await this.storageCredentials.summarizeForStorages({
        projectId,
        userId,
        roles,
        storages: storages.map(({ id, type }) => ({ id, type })),
      })
    );
    const onOldKey = await this.legacy.storageIdsOnOldKey(
      storages
        .filter(storage => !summaries.has(storage.id) && this.legacy.hasOldKey(storage))
        .map(storage => storage.id)
    );
    for (const id of onOldKey) summaries.set(id, { access: 'pending', state: 'ready' });
    return summaries;
  }

  /** The lost-grant error for a bound Storage, or null when the Storage is unbound. */
  async lostGrantFor(storage: DataStorage): Promise<StorageCredentialUnavailableException | null> {
    const bound = await this.storageCredentials.resolveForStorage(storage);
    return bound ? lostGrantException() : null;
  }

  async resolve(storage: DataStorage): Promise<DataStorageCredentials> {
    const bound = await this.storageCredentials.resolveForStorage(storage);
    // A bound Storage never falls back to the old row, whatever happened to its Credential.
    if (!bound) return this.legacy.resolve(storage);
    const result = await this.resolveCredential(storage, bound);
    await this.storageCredentials.markStorageUsed(storage.id, bound.credentialId);
    return result;
  }

  /** A Credential's adapter shape for this Storage, bound or about to be, once its state allows. */
  async resolveCredential(
    storage: DataStorage,
    credential: ResolvedStorageCredential
  ): Promise<DataStorageCredentials> {
    const { state } = credential;
    // Errors never name the Credential: callers may see only its restricted summary.
    if (state === 'disabled') {
      throw new StorageCredentialUnavailableException(
        "This Storage's Credential is disabled. A Credential maintainer can enable it on the Credentials page.",
        false
      );
    }
    if (state === 'not-configured') {
      throw new StorageCredentialUnavailableException(
        'BigQuery Google account Credentials cannot be used because Google sign-in is not configured on this server.',
        false
      );
    }
    if (state === 'reconnect-required') throw lostGrantException();
    if (state === 'reauthorize-required') {
      throw new StorageCredentialUnavailableException(
        "This Storage's Credential lacks the Google permissions this Storage needs. A Credential maintainer can reconnect it on the Credentials page to grant them.",
        true
      );
    }

    if ('oauth' in credential.secret) {
      try {
        const { client, clientId } = await this.storageCredentials.getGoogleOAuth2Client(
          storage.projectId,
          credential.credentialId
        );
        return {
          type: BIGQUERY_OAUTH_TYPE,
          oauth2Client: client,
          oauthClientId: clientId,
        } satisfies BigQueryOAuthCredentials;
      } catch (error) {
        // Google refused the refresh, or the grant's client was replaced; reconnecting fixes both.
        if (
          error instanceof CredentialsExpiredException ||
          (error instanceof GoogleOAuthException && error.code === 'OAUTH_NOT_CONFIGURED')
        ) {
          throw lostGrantException();
        }
        throw error;
      }
    }
    try {
      return toAdapterCredentials(
        credential.definitionId,
        credential.secret,
        credential.publicMetadata
      ) as DataStorageCredentials;
    } catch {
      // The parse error can quote a fragment of the key, so it is dropped.
      throw new Error("The stored key of this Storage's Credential could not be read");
    }
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
}

function lostGrantException(): StorageCredentialUnavailableException {
  return new StorageCredentialUnavailableException(
    "This Storage's Credential lost Google authorization. A Credential maintainer can reconnect it on the Credentials page.",
    true
  );
}
