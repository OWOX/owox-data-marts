import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { isUniqueConstraintViolation } from '../../../common/typeorm/query-error.utils';
import { AccessDecisionService, Action, EntityType } from '../../services/access-decision';
import { materialKey } from './credential-material-key';
import { requirementRevision } from './credential-requirement-revision';
import type { CredentialConsumerType, CredentialRequirementSnapshot } from '../credential.types';
import { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import { CredentialContext } from '../entities/credential-context.entity';
import { Credential } from '../entities/credential.entity';
import { CredentialService } from './credential.service';

/** A consumer's one binding per requirement; the unique index leaves the project out. */
export interface CredentialBindingKey {
  readonly consumerType: CredentialConsumerType;
  readonly consumerId: string;
  readonly requirementKey: string;
}

export interface CredentialUseCheck {
  readonly projectId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly credentialId: string;
}

export interface CredentialBindingCheck extends CredentialUseCheck {
  readonly acceptedDefinitionIds: readonly string[];
  /** The 400 for a Credential of another definition, in the consumer's words. */
  readonly notAcceptedMessage: string;
}

export type BoundCredential = Pick<
  Credential,
  'id' | 'title' | 'definitionId' | 'enabled' | 'validationState' | 'publicMetadata'
>;

/** Binds Credentials to their consumers, whatever kind of consumer they are. */
@Injectable()
export class CredentialBindingService {
  constructor(
    @InjectRepository(CredentialConsumerBinding)
    private readonly bindings: Repository<CredentialConsumerBinding>,
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    @InjectRepository(CredentialContext)
    private readonly contexts: Repository<CredentialContext>,
    private readonly access: AccessDecisionService,
    private readonly credentialService: CredentialService
  ) {}

  /** The checks of `check` under the Credential's lock, then the consumer's row for the key. */
  @Transactional()
  async bind(
    input: CredentialBindingCheck &
      CredentialBindingKey & { readonly requirement: CredentialRequirementSnapshot }
  ): Promise<void> {
    // The lock serializes this binding with a concurrent deletion of the Credential.
    const credential = await this.assertBindable(
      await this.credentialService.lockActiveByIdAndProjectId(input.credentialId, input.projectId),
      input
    );
    const key = keyOf(input);
    const values = {
      projectId: input.projectId,
      ...boundValues(credential.id, input.requirement, input.userId),
    };
    // The unique index covers inactive rows too, so a consumer keeps reusing its one row.
    const binding = await this.bindings.findOneBy(key);
    if (binding) {
      if (binding.credentialId !== credential.id) binding.lastUsedAt = null;
      await this.bindings.save(Object.assign(binding, values));
      return;
    }
    try {
      await this.bindings.insert({ ...key, ...values });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      // A concurrent first binding won the insert; an UPDATE sees its row where a re-read may not.
      await this.bindings.update(key, { ...values, lastUsedAt: null });
    }
  }

  /** The checks bind makes, without the lock or a write: 404, USE (403), then fit and enabled (400). */
  async check(input: CredentialBindingCheck): Promise<Credential> {
    return this.assertBindable(
      await this.credentials.findOneBy({ id: input.credentialId, projectId: input.projectId }),
      input
    );
  }

  async assertCanUse(input: CredentialUseCheck): Promise<void> {
    const canUse = await this.access.canAccess(
      input.userId,
      [...input.roles],
      EntityType.CREDENTIAL,
      input.credentialId,
      Action.USE,
      input.projectId
    );
    if (!canUse) throw new ForbiddenException('You cannot use this Credential.');
  }

  private async assertBindable(
    credential: Credential | null,
    input: CredentialBindingCheck
  ): Promise<Credential> {
    if (!credential) {
      throw new NotFoundException(`Credential ${input.credentialId} was not found`);
    }
    await this.assertCanUse({ ...input, credentialId: credential.id });
    if (!input.acceptedDefinitionIds.includes(credential.definitionId)) {
      throw new BadRequestException(input.notAcceptedMessage);
    }
    if (!credential.enabled) throw new BadRequestException('This Credential is disabled.');
    return credential;
  }

  /** The active binding for the key in the project, with its Credential, or null once that is gone. */
  async resolve(
    key: CredentialBindingKey & { readonly projectId: string }
  ): Promise<{ binding: CredentialConsumerBinding; credential: Credential | null } | null> {
    const binding = await this.bindings.findOneBy({
      ...keyOf(key),
      projectId: key.projectId,
      active: true,
    });
    if (!binding) return null;
    const credential = await this.credentials.findOneBy({
      id: binding.credentialId,
      projectId: key.projectId,
    });
    return { binding, credential };
  }

  /** The consumers' active bindings for one key, each Credential without its secret, null once gone. */
  async listBound(input: {
    readonly projectId: string;
    readonly consumerType: CredentialConsumerType;
    readonly requirementKey: string;
    readonly consumerIds: readonly string[];
  }): Promise<{ consumerId: string; credential: BoundCredential | null }[]> {
    if (input.consumerIds.length === 0) return [];
    const bound = await this.bindings.find({
      where: {
        consumerType: input.consumerType,
        requirementKey: input.requirementKey,
        consumerId: In([...input.consumerIds]),
        projectId: input.projectId,
        active: true,
      },
    });
    if (bound.length === 0) return [];
    const found = await this.credentials.find({
      where: {
        id: In([...new Set(bound.map(binding => binding.credentialId))]),
        projectId: input.projectId,
      },
      select: {
        id: true,
        title: true,
        definitionId: true,
        enabled: true,
        validationState: true,
        publicMetadata: true,
      },
    });
    const byId = new Map(found.map(credential => [credential.id, credential]));
    return bound.map(binding => ({
      consumerId: binding.consumerId,
      credential: byId.get(binding.credentialId) ?? null,
    }));
  }

  /** In the caller's transaction, the Credential the key is bound to now, read under a lock. */
  lockBoundCredentialId(
    key: CredentialBindingKey & { readonly projectId: string }
  ): Promise<string | null> {
    return this.credentialService.lockBoundCredentialId({
      ...keyOf(key),
      projectId: key.projectId,
    });
  }

  /** Every binding of the consumer stops counting, in any project; the rows stay for a rebind. */
  async deactivate(consumer: {
    readonly consumerType: CredentialConsumerType;
    readonly consumerId: string;
  }): Promise<void> {
    await this.bindings.update(
      { consumerType: consumer.consumerType, consumerId: consumer.consumerId },
      { active: false }
    );
  }

  markUsed(input: CredentialBindingKey & { readonly credentialId: string }): Promise<void> {
    return this.credentialService.markLastUsed(input);
  }

  /** Moves the binding with its Credential, or with a copy when other consumers share it. */
  @Transactional()
  async move(key: CredentialBindingKey, fromProjectId: string, toProjectId: string): Promise<void> {
    const binding = await this.bindings.findOneBy({
      ...keyOf(key),
      projectId: fromProjectId,
      active: true,
    });
    if (!binding) return;
    // The lock keeps another consumer from binding the Credential between the count and the move.
    const original = await this.credentialService.lockActiveByIdAndProjectId(
      binding.credentialId,
      fromProjectId
    );
    if (!original) return;
    // The no-op UPDATE is a current read: a consumer rebound during the lock wait keeps its choice.
    const unchanged = await this.bindings
      .createQueryBuilder()
      .update(CredentialConsumerBinding)
      .set({ modifiedAt: () => 'modifiedAt' })
      .where('id = :id AND credentialId = :credentialId AND projectId = :projectId', {
        id: binding.id,
        credentialId: original.id,
        projectId: fromProjectId,
      })
      .andWhere('active = :active', { active: true })
      .execute();
    if (unchanged.affected !== 1) return;
    // An identical Credential in the target wins; an original left unbound stays for its owners.
    let credentialId = await this.lockIdenticalCredential(original, toProjectId);
    if (
      !credentialId &&
      (await this.credentialService.countActiveBindings(original.id, binding.id)) === 0
    ) {
      credentialId = original.id;
      // Sharing granted in the old project grants nothing in the new one.
      await this.credentials.update(original.id, {
        projectId: toProjectId,
        availableForUse: false,
        availableForMaintenance: false,
      });
      await this.contexts.delete({ credentialId: original.id });
    } else if (!credentialId) {
      const copy = await this.credentialService.createWithAccess(
        {
          projectId: toProjectId,
          title: original.title,
          definitionSource: original.definitionSource,
          definitionId: original.definitionId,
          acceptedCompatibilityLine: original.acceptedCompatibilityLine,
          secret: original.secret,
          publicMetadata: original.publicMetadata,
          enabled: original.enabled,
          availableForUse: false,
          availableForMaintenance: false,
        },
        { createdBy: null, ownerIds: original.ownerIds, contextIds: [] }
      );
      credentialId = copy.id;
    }
    await this.bindings.update(binding.id, { credentialId, projectId: toProjectId });
  }

  /** A live Credential in the project with the key, owners and enabled flag a copy would get. */
  private async lockIdenticalCredential(
    original: Credential,
    projectId: string
  ): Promise<string | undefined> {
    const key = materialKey(original.definitionId, original.secret, original.publicMetadata);
    const ownerSet = (credential: Credential) =>
      JSON.stringify([...new Set(credential.ownerIds)].sort());
    const candidates = await this.credentials.find({
      where: { projectId, definitionId: original.definitionId, enabled: original.enabled },
      relations: { owners: true },
    });
    for (const candidate of candidates) {
      if (
        ownerSet(candidate) !== ownerSet(original) ||
        materialKey(candidate.definitionId, candidate.secret, candidate.publicMetadata) !== key
      ) {
        continue;
      }
      // The lock keeps a concurrent delete from leaving the consumer on a deleted Credential.
      if (await this.credentialService.lockActiveByIdAndProjectId(candidate.id, projectId)) {
        return candidate.id;
      }
    }
    return undefined;
  }
}

function keyOf(key: CredentialBindingKey): CredentialBindingKey {
  return {
    consumerType: key.consumerType,
    consumerId: key.consumerId,
    requirementKey: key.requirementKey,
  };
}

/** What a binding holds once it points at a Credential for a requirement. */
export function boundValues(
  credentialId: string,
  requirement: CredentialRequirementSnapshot,
  configuredById: string | null
) {
  return {
    credentialId,
    requirementSnapshot: requirement,
    requirementRevision: requirementRevision(requirement),
    configuredById,
    active: true,
  };
}
