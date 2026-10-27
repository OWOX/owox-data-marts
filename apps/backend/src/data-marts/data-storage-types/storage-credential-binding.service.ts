import { BadRequestException, Injectable } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';
import {
  credentialIdentity,
  type AcceptedCredentialRequirement,
  type CredentialDefinitionContract,
  type CredentialPublicMetadata,
  type CredentialSecret,
} from '../credentials/credential.types';
import type { Credential } from '../credentials/entities/credential.entity';
import {
  CredentialBindingService,
  type BoundCredential,
} from '../credentials/services/credential-binding.service';
import { CredentialDefinitionService } from '../credentials/services/credential-definition.service';
import { CredentialGoogleOAuthService } from '../credentials/services/credential-google-oauth.service';
import { CredentialService } from '../credentials/services/credential.service';
import type { DataStorage } from '../entities/data-storage.entity';
import { StorageCredentialUnavailableException } from '../exceptions/storage-credential-unavailable.exception';
import { AccessDecisionService, Action, EntityType } from '../services/access-decision';
import { GoogleOAuthConfigService } from '../services/google-oauth/google-oauth-config.service';
import {
  STORAGE_BINDING,
  storageCredentialRequirement,
  storageCredentialState,
  type StorageCredentialState,
  type StorageCredentialSummary,
} from './storage-credential-state';

export interface ResolvedStorageCredential {
  readonly credentialId: string;
  readonly title: string;
  readonly definitionId: string;
  readonly state: StorageCredentialState;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
}

export interface StorageBindingCheck {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly credentialId: string;
  readonly type: DataStorage['type'];
}

type StorageRef = Pick<DataStorage, 'id' | 'projectId' | 'type'>;

const NOT_ACCEPTED = 'This Credential cannot be used with this Storage type.';

interface BoundStorage {
  readonly storageId: string;
  readonly credential: BoundCredential;
  readonly contract: CredentialDefinitionContract;
}

/** How Storages bind, resolve and summarize their Credential: one `storage` binding each. */
@Injectable()
export class StorageCredentialBindingService {
  constructor(
    private readonly binder: CredentialBindingService,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService,
    private readonly credentialService: CredentialService,
    private readonly googleOAuth: CredentialGoogleOAuthService,
    private readonly googleOAuthConfig: GoogleOAuthConfigService
  ) {}

  /** Snapshots the Storage type's requirement, the same whichever accepted Credential is chosen. */
  bindStorage(input: StorageBindingCheck & { storageId: string }): Promise<void> {
    const requirement = this.requirement(input.type);
    return this.binder.bind({
      projectId: input.projectId,
      userId: input.userId,
      roles: input.roles,
      credentialId: input.credentialId,
      acceptedDefinitionIds: requirement.definitionIds,
      notAcceptedMessage: NOT_ACCEPTED,
      ...STORAGE_BINDING,
      consumerId: input.storageId,
      requirement,
    });
  }

  /** The checks bindStorage makes, USE first, without writing; the Credential it would bind. */
  async checkStorageBinding(input: StorageBindingCheck): Promise<ResolvedStorageCredential> {
    const requirement = this.requirement(input.type);
    const credential = await this.binder.check({
      projectId: input.projectId,
      userId: input.userId,
      roles: input.roles,
      credentialId: input.credentialId,
      acceptedDefinitionIds: requirement.definitionIds,
      notAcceptedMessage: NOT_ACCEPTED,
    });
    return this.toResolved(credential, requirement);
  }

  /** The USE check of bindStorage, for a change that redirects a bound Credential's key. */
  assertCanUseCredential(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    credentialId: string;
  }): Promise<void> {
    return this.binder.assertCanUse(input);
  }

  /** In the caller's transaction, the Credential the Storage is bound to now, read under a lock. */
  lockBoundCredentialId(projectId: string, storageId: string): Promise<string | null> {
    return this.binder.lockBoundCredentialId({
      ...STORAGE_BINDING,
      consumerId: storageId,
      projectId,
    });
  }

  deactivateStorage(storageId: string): Promise<void> {
    return this.binder.deactivate({
      consumerType: STORAGE_BINDING.consumerType,
      consumerId: storageId,
    });
  }

  async findBoundStorageIds(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<ReadonlySet<string>> {
    const bound = await this.binder.listBound({
      ...STORAGE_BINDING,
      projectId,
      consumerIds: storageIds,
    });
    return new Set(bound.map(row => row.consumerId));
  }

  /** Checks no member access: running a Storage needs access to the Storage only. */
  async resolveForStorage(storage: StorageRef): Promise<ResolvedStorageCredential | null> {
    const bound = await this.binder.resolve({
      ...STORAGE_BINDING,
      consumerId: storage.id,
      projectId: storage.projectId,
    });
    if (!bound) return null;
    if (!bound.credential) {
      // The delete guard keeps a bound Credential; should it go anyway, runs fail as on any unusable one.
      throw new StorageCredentialUnavailableException(
        "This Storage's Credential no longer exists. Select another Credential for this Storage.",
        false
      );
    }
    return this.toResolved(bound.credential, this.requirement(storage.type));
  }

  private async toResolved(
    credential: Credential,
    requirement: AcceptedCredentialRequirement
  ): Promise<ResolvedStorageCredential> {
    const { contract } = await this.definitions.get(credential.definitionId);
    return {
      credentialId: credential.id,
      title: credential.title,
      definitionId: credential.definitionId,
      state: storageCredentialState(credential, contract, requirement.scopes),
      secret: credential.secret,
      publicMetadata: credential.publicMetadata ?? null,
    };
  }

  async getGoogleOAuth2Client(
    projectId: string,
    credentialId: string
  ): Promise<{ client: OAuth2Client; clientId: string }> {
    const credential = await this.credentialService.getByIdAndProjectId(credentialId, projectId);
    if (!credential.enabled) throw new BadRequestException('This Credential is disabled.');
    return this.googleOAuth.getOAuth2Client(credentialId);
  }

  async summarizeForStorages(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    storages: readonly Pick<DataStorage, 'id' | 'type'>[];
  }): Promise<ReadonlyMap<string, StorageCredentialSummary>> {
    const bound = await this.boundCredentials(
      input.projectId,
      input.storages.map(storage => storage.id)
    );
    const canSee = await this.access.canAccessMany(
      input.userId,
      [...input.roles],
      EntityType.CREDENTIAL,
      bound.map(row => row.credential.id),
      Action.SEE,
      input.projectId
    );
    const types = new Map(input.storages.map(storage => [storage.id, storage.type]));
    const summaries = new Map<string, StorageCredentialSummary>();
    for (const { storageId, credential, contract } of bound) {
      // Every bound row comes from input.storages.
      const { scopes } = this.requirement(types.get(storageId)!);
      const state = storageCredentialState(credential, contract, scopes);
      summaries.set(
        storageId,
        canSee.get(credential.id)
          ? {
              access: 'visible',
              id: credential.id,
              title: credential.title,
              definitionId: credential.definitionId,
              providerName: contract.displayName,
              identity: credentialIdentity(contract, credential.publicMetadata ?? null),
              state,
            }
          : { access: 'restricted', state }
      );
    }
    return summaries;
  }

  async identitiesForStorages(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<ReadonlyMap<string, string | null>> {
    const bound = await this.boundCredentials(projectId, storageIds);
    return new Map(
      bound.map(({ storageId, credential, contract }) => [
        storageId,
        credentialIdentity(contract, credential.publicMetadata ?? null),
      ])
    );
  }

  async markStorageUsed(storageId: string, credentialId: string): Promise<void> {
    // Usage telemetry must never fail a Storage run.
    await this.binder
      .markUsed({ credentialId, ...STORAGE_BINDING, consumerId: storageId })
      .catch(() => undefined);
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

  private requirement(type: DataStorage['type']): AcceptedCredentialRequirement {
    return storageCredentialRequirement(type, this.googleOAuthConfig);
  }

  /** Bound Credentials without their secrets; a binding whose Credential is gone is left out. */
  private async boundCredentials(
    projectId: string,
    storageIds: readonly string[]
  ): Promise<BoundStorage[]> {
    const bound = await this.binder.listBound({
      ...STORAGE_BINDING,
      projectId,
      consumerIds: storageIds,
    });
    const rows: BoundStorage[] = [];
    for (const { consumerId, credential } of bound) {
      if (!credential) continue;
      const { contract } = await this.definitions.get(credential.definitionId);
      rows.push({ storageId: consumerId, credential, contract });
    }
    return rows;
  }
}
