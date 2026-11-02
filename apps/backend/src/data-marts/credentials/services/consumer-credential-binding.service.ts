import { BadRequestException } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { GoogleOAuthConfigService } from '../../services/google-oauth/google-oauth-config.service';
import {
  credentialIdentity,
  type AcceptedCredentialRequirement,
  type CredentialConsumerType,
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
  readonly refreshTokenStaticAt: Date | null;
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

/** How a kind of consumer binds, resolves and summarizes its Credentials, one per requirement key. */
export abstract class ConsumerCredentialBindingService<TType extends string> {
  protected abstract readonly binding: {
    readonly consumerType: CredentialConsumerType;
    /** The key a call uses unless it names its own. */
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
  lockBoundCredentialId(
    projectId: string,
    consumerId: string,
    requirementKey = this.binding.requirementKey
  ): Promise<string | null> {
    return this.binder.lockBoundCredentialId({
      ...this.binding,
      requirementKey,
      consumerId,
      projectId,
    });
  }

  /** Every binding of the consumer, or only the one for `requirementKey`. */
  protected deactivateConsumer(consumerId: string, requirementKey?: string): Promise<void> {
    return this.binder.deactivate({
      consumerType: this.binding.consumerType,
      consumerId,
      requirementKey,
    });
  }

  protected async findBoundIds(
    projectId: string,
    consumerIds: readonly string[]
  ): Promise<ReadonlySet<string>> {
    const bound = await this.binder.listBound({ ...this.binding, projectId, consumerIds });
    return new Set(bound.map(row => row.consumerId));
  }

  /** Checks no member access: running a consumer needs access to the consumer only. */
  protected async resolveForConsumer(
    consumer: {
      readonly id: string;
      readonly projectId: string;
      readonly type: TType;
    },
    requirementKey = this.binding.requirementKey
  ): Promise<ResolvedConsumerCredential | null> {
    const bound = await this.binder.resolve({
      ...this.binding,
      requirementKey,
      consumerId: consumer.id,
      projectId: consumer.projectId,
    });
    if (!bound) return null;
    if (!bound.credential) throw this.boundCredentialGone();
    return this.toResolved(bound.credential, this.requirement(consumer.type));
  }

  /** A project's Credential by id, without a binding or member access checks; null when it is gone. */
  protected async resolveCredentialById(
    projectId: string,
    credentialId: string,
    type: TType
  ): Promise<ResolvedConsumerCredential | null> {
    const credential = await this.credentialService.findById(credentialId);
    if (!credential || credential.projectId !== projectId) return null;
    return this.toResolved(credential, this.requirement(type));
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
    const bound = await this.binder.listBound({
      ...this.binding,
      projectId: input.projectId,
      consumerIds: input.consumers.map(consumer => consumer.id),
    });
    const types = new Map(input.consumers.map(consumer => [consumer.id, consumer.type]));
    return this.summarizeBound(
      input,
      bound.map(({ consumerId, credential }) => ({
        key: consumerId,
        credential,
        // Every bound row comes from input.consumers.
        type: types.get(consumerId)!,
      }))
    );
  }

  /** Each row's summary under its key; a row whose Credential is gone is left out. */
  protected async summarizeBound(
    member: { projectId: string; userId: string; roles: readonly string[] },
    rows: readonly { key: string; credential: BoundCredential | null; type: TType }[]
  ): Promise<ReadonlyMap<string, CredentialConsumerSummary>> {
    const live = rows.filter(
      (row): row is typeof row & { credential: BoundCredential } => row.credential !== null
    );
    const canSee = await this.access.canAccessMany(
      member.userId,
      [...member.roles],
      EntityType.CREDENTIAL,
      live.map(row => row.credential.id),
      Action.SEE,
      member.projectId
    );
    const summaries = new Map<string, CredentialConsumerSummary>();
    for (const { key, credential, type } of live) {
      const { contract } = await this.definitions.get(credential.definitionId);
      const state = credentialConsumerState(credential, contract, this.requirement(type).scopes);
      summaries.set(
        key,
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

  protected async markConsumerUsed(
    consumerId: string,
    credentialId: string,
    requirementKey = this.binding.requirementKey
  ): Promise<void> {
    // Usage telemetry must never fail a run.
    await this.binder
      .markUsed({ credentialId, ...this.binding, requirementKey, consumerId })
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
      refreshTokenStaticAt: credential.refreshTokenStaticAt ?? null,
    };
  }
}
