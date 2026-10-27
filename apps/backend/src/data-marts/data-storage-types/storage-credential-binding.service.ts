import { Injectable } from '@nestjs/common';
import type { AcceptedCredentialRequirement } from '../credentials/credential.types';
import { CredentialBindingService } from '../credentials/services/credential-binding.service';
import {
  ConsumerCredentialBindingService,
  type ConsumerBindingCheck,
  type ResolvedConsumerCredential,
} from '../credentials/services/consumer-credential-binding.service';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialGoogleOAuthService } from '../credentials/services/credential-google-oauth.service';
import { CredentialService } from '../credentials/services/credential.service';
import type { DataStorage } from '../entities/data-storage.entity';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { AccessDecisionService } from '../services/access-decision';
import { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import {
  STORAGE_BINDING,
  storageCredentialRequirement,
  type StorageCredentialSummary,
} from './storage-credential-state';

export type ResolvedStorageCredential = ResolvedConsumerCredential;

export type StorageBindingCheck = ConsumerBindingCheck<DataStorage['type']>;

/** How Storages bind, resolve and summarize their Credential: one `storage` binding each. */
@Injectable()
export class StorageCredentialBindingService extends ConsumerCredentialBindingService<
  DataStorage['type']
> {
  protected readonly binding = STORAGE_BINDING;
  protected readonly consumerName = 'Storage';

  constructor(
    binder: CredentialBindingService,
    definitions: CredentialDefinitionService,
    access: AccessDecisionService,
    credentialService: CredentialService,
    googleOAuth: CredentialGoogleOAuthService,
    googleOAuthConfig: GoogleOAuthConfigService
  ) {
    super(binder, definitions, access, credentialService, googleOAuth, googleOAuthConfig);
  }

  bindStorage(input: StorageBindingCheck & { storageId: string }): Promise<void> {
    return this.bindConsumer({ ...input, consumerId: input.storageId });
  }

  checkStorageBinding(input: StorageBindingCheck): Promise<ResolvedStorageCredential> {
    return this.checkConsumerBinding(input);
  }

  deactivateStorage(storageId: string): Promise<void> {
    return this.deactivateConsumer(storageId);
  }

  findBoundStorageIds(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<ReadonlySet<string>> {
    return this.findBoundIds(projectId, storageIds);
  }

  resolveForStorage(
    storage: Pick<DataStorage, 'id' | 'projectId' | 'type'>
  ): Promise<ResolvedStorageCredential | null> {
    return this.resolveForConsumer(storage);
  }

  summarizeForStorages(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    storages: readonly Pick<DataStorage, 'id' | 'type'>[];
  }): Promise<ReadonlyMap<string, StorageCredentialSummary>> {
    return this.summarizeConsumers({ ...input, consumers: input.storages });
  }

  identitiesForStorages(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<ReadonlyMap<string, string | null>> {
    return this.identitiesOf(projectId, storageIds);
  }

  markStorageUsed(storageId: string, credentialId: string): Promise<void> {
    return this.markConsumerUsed(storageId, credentialId);
  }

  /** Reuses an identical Credential in the target, else moves it as Not shared, or copies it. */
  async moveStorageCredential(input: {
    storageId: string;
    fromProjectId: string;
    toProjectId: string;
  }): Promise<void> {
    await this.binder.move(
      { ...STORAGE_BINDING, consumerId: input.storageId },
      input.fromProjectId,
      input.toProjectId
    );
  }

  // The delete guard keeps a bound Credential; should it go anyway, runs fail as on any unusable one.
  protected boundCredentialGone(): Error {
    return new StorageCredentialUnavailableException(
      "This Storage's Credential no longer exists. Select another Credential for this Storage.",
      false
    );
  }

  protected requirement(type: DataStorage['type']): AcceptedCredentialRequirement {
    return storageCredentialRequirement(type, this.googleOAuthConfig);
  }
}
