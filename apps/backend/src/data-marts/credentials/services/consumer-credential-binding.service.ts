import { BadRequestException } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { GoogleOAuthConfigService } from '../../services/google-oauth/google-oauth-config.service';
import {
  credentialIdentity,
  type AcceptedCredentialRequirement,
  type CredentialConsumerType,
  type CredentialDefinitionContract,
  type CredentialPublicMetadata,
  type CredentialSecret,
} from '../credential.types';
import type { Credential } from '../entities/credential.entity';
import { CredentialBindingService, type BoundCredential } from './credential-binding.service';
import {
  credentialConsumerState,
  type CredentialConsumerState,
  type CredentialConsumerSummary,
} from './credential-consumer-state';
import { CredentialDefinitionService } from './credential-definition.service';
import { CredentialGoogleOAuthService } from './credential-google-oauth.service';
import { CredentialService } from './credential.service';

export interface ResolvedConsumerCredential {
  readonly credentialId: string;
  readonly title: string;
  readonly definitionId: string;
  readonly state: CredentialConsumerState;
  readonly secret: CredentialSecret;
  readonly publicMetadata: CredentialPublicMetadata | null;
}

/** A bound Credential's definition and public metadata, without its secret. */
export interface PublicOfConsumer {
  definitionId: string;
  publicMetadata: CredentialPublicMetadata | null;
}

export interface ConsumerBindingCheck<TType> {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly credentialId: string;
  readonly type: TType;
}

interface BoundConsumer {
  readonly consumerId: string;
  readonly credential: BoundCredential;
  readonly contract: CredentialDefinitionContract;
}

/** How a kind of consumer with one Credential each (Storage, Destination) binds, resolves and summarizes it. */
export abstract class ConsumerCredentialBindingService<TType extends string> {
  protected abstract readonly binding: {
    readonly consumerType: CredentialConsumerType;
    readonly requirementKey: string;
  };
  /** The consumer as messages name it: "Storage", "Destination". */
  protected abstract readonly consumerName: string;
  /** What a consumer of the type accepts; throws for a type that binds no Credential. */
  protected abstract requirement(type: TType): AcceptedCredentialRequirement;

  constructor(
    protected readonly binder: CredentialBindingService,
    private readonly definitions: CredentialDefinitionService,
    private readonly access: AccessDecisionService,
    private readonly credentialService: CredentialService,
    private readonly googleOAuth: CredentialGoogleOAuthService,
    protected readonly googleOAuthConfig: GoogleOAuthConfigService
  ) {}

  /** Snapshots the type's requirement, the same whichever accepted Credential is chosen. */
  protected bindConsumer(
    input: ConsumerBindingCheck<TType> & { consumerId: string }
  ): Promise<void> {
    // Called before any await so an unknown type throws synchronously, as callers expect.
    const requirement = this.requirement(input.type);
    return this.binder.bind({
      projectId: input.projectId,
      userId: input.userId,
      roles: input.roles,
      credentialId: input.credentialId,
      acceptedDefinitionIds: requirement.definitionIds,
      notAcceptedMessage: this.notAcceptedMessage(),
      ...this.binding,
      consumerId: input.consumerId,
      requirement,
    });
  }

  /** The checks a bind makes, USE first, without writing; the Credential it would bind. */
  protected async checkConsumerBinding(
    input: ConsumerBindingCheck<TType>
  ): Promise<ResolvedConsumerCredential> {
    const requirement = this.requirement(input.type);
    const credential = await this.binder.check({
      projectId: input.projectId,
      userId: input.userId,
      roles: input.roles,
      credentialId: input.credentialId,
      acceptedDefinitionIds: requirement.definitionIds,
      notAcceptedMessage: this.notAcceptedMessage(),
    });
    return this.toResolved(credential, requirement);
  }

  /** The USE check of a bind, for a change that redirects a bound Credential's key. */
  assertCanUseCredential(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    credentialId: string;
  }): Promise<void> {
    return this.binder.assertCanUse(input);
  }

  /** In the caller's transaction, the Credential the consumer is bound to now, read under a lock. */
  lockBoundCredentialId(projectId: string, consumerId: string): Promise<string | null> {
    return this.binder.lockBoundCredentialId({ ...this.binding, consumerId, projectId });
  }

  protected deactivateConsumer(consumerId: string): Promise<void> {
    return this.binder.deactivate({ consumerType: this.binding.consumerType, consumerId });
  }

  protected async findBoundIds(
    projectId: string,
    consumerIds: readonly string[]
  ): Promise<ReadonlySet<string>> {
    const bound = await this.binder.listBound({ ...this.binding, projectId, consumerIds });
    return new Set(bound.map(row => row.consumerId));
  }

  /** Checks no member access: running a consumer needs access to the consumer only. */
  protected async resolveForConsumer(consumer: {
    readonly id: string;
    readonly projectId: string;
    readonly type: TType;
  }): Promise<ResolvedConsumerCredential | null> {
    const bound = await this.binder.resolve({
      ...this.binding,
      consumerId: consumer.id,
      projectId: consumer.projectId,
    });
    if (!bound) return null;
    if (!bound.credential) throw this.boundCredentialGone();
    return this.toResolved(bound.credential, this.requirement(consumer.type));
  }

  /** What resolving a consumer whose bound Credential was deleted throws. */
  protected abstract boundCredentialGone(): Error;

  async getGoogleOAuth2Client(
    projectId: string,
    credentialId: string
  ): Promise<{ client: OAuth2Client; clientId: string }> {
    const credential = await this.credentialService.getByIdAndProjectId(credentialId, projectId);
    if (!credential.enabled) throw new BadRequestException('This Credential is disabled.');
    return this.googleOAuth.getOAuth2Client(credentialId);
  }

  protected async summarizeConsumers(input: {
    projectId: string;
    userId: string;
    roles: readonly string[];
    consumers: readonly { readonly id: string; readonly type: TType }[];
  }): Promise<ReadonlyMap<string, CredentialConsumerSummary>> {
    const bound = await this.boundCredentials(
      input.projectId,
      input.consumers.map(consumer => consumer.id)
    );
    const canSee = await this.access.canAccessMany(
      input.userId,
      [...input.roles],
      EntityType.CREDENTIAL,
      bound.map(row => row.credential.id),
      Action.SEE,
      input.projectId
    );
    const types = new Map(input.consumers.map(consumer => [consumer.id, consumer.type]));
    const summaries = new Map<string, CredentialConsumerSummary>();
    for (const { consumerId, credential, contract } of bound) {
      // Every bound row comes from input.consumers.
      const { scopes } = this.requirement(types.get(consumerId)!);
      const state = credentialConsumerState(credential, contract, scopes);
      summaries.set(
        consumerId,
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

  /** `withGone` also lists a binding whose Credential was deleted, with a null identity. */
  protected async identitiesOf(
    projectId: string,
    consumerIds: readonly string[],
    withGone = false
  ): Promise<ReadonlyMap<string, string | null>> {
    const bound = await this.binder.listBound({ ...this.binding, projectId, consumerIds });
    const identities = new Map<string, string | null>();
    for (const { consumerId, credential } of bound) {
      if (!credential) {
        if (withGone) identities.set(consumerId, null);
        continue;
      }
      const { contract } = await this.definitions.get(credential.definitionId);
      identities.set(consumerId, credentialIdentity(contract, credential.publicMetadata ?? null));
    }
    return identities;
  }

  /** Bound Credentials' definition and public metadata, never the secret; null where the Credential is gone. */
  protected async publicOf(
    projectId: string,
    consumerIds: readonly string[]
  ): Promise<ReadonlyMap<string, PublicOfConsumer | null>> {
    const bound = await this.binder.listBound({ ...this.binding, projectId, consumerIds });
    return new Map(
      bound.map(({ consumerId, credential }) => [
        consumerId,
        credential
          ? {
              definitionId: credential.definitionId,
              publicMetadata: credential.publicMetadata ?? null,
            }
          : null,
      ])
    );
  }

  /** In the caller's transaction, under the consumer's lock: undefined when unbound, null once the Credential is gone. */
  protected async lockedPublicOf(
    projectId: string,
    consumerId: string
  ): Promise<PublicOfConsumer | null | undefined> {
    const credentialId = await this.lockBoundCredentialId(projectId, consumerId);
    if (!credentialId) return undefined;
    const credential = await this.credentialService.findById(credentialId);
    return credential
      ? { definitionId: credential.definitionId, publicMetadata: credential.publicMetadata ?? null }
      : null;
  }

  protected async markConsumerUsed(consumerId: string, credentialId: string): Promise<void> {
    // Usage telemetry must never fail a run.
    await this.binder
      .markUsed({ credentialId, ...this.binding, consumerId })
      .catch(() => undefined);
  }

  private notAcceptedMessage(): string {
    return `This Credential cannot be used with this ${this.consumerName} type.`;
  }

  private async toResolved(
    credential: Credential,
    requirement: AcceptedCredentialRequirement
  ): Promise<ResolvedConsumerCredential> {
    const { contract } = await this.definitions.get(credential.definitionId);
    return {
      credentialId: credential.id,
      title: credential.title,
      definitionId: credential.definitionId,
      state: credentialConsumerState(credential, contract, requirement.scopes),
      secret: credential.secret,
      publicMetadata: credential.publicMetadata ?? null,
    };
  }

  /** Bound Credentials without their secrets; a binding whose Credential is gone is left out. */
  private async boundCredentials(
    projectId: string,
    consumerIds: readonly string[]
  ): Promise<BoundConsumer[]> {
    const bound = await this.binder.listBound({ ...this.binding, projectId, consumerIds });
    const rows: BoundConsumer[] = [];
    for (const { consumerId, credential } of bound) {
      if (!credential) continue;
      const { contract } = await this.definitions.get(credential.definitionId);
      rows.push({ consumerId, credential, contract });
    }
    return rows;
  }
}
