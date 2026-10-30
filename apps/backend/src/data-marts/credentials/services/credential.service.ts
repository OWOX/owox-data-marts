import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Transactional } from 'typeorm-transactional';
import { Core } from '@owox/connectors';
import type { AuthorizationContext } from '../../../idp';
import { IdpProjectionsFacade } from '../../../idp/facades/idp-projections.facade';
import { ContextService } from '../../services/context/context.service';
import { syncOwners } from '../../utils/sync-owners';
import { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import { CredentialContext } from '../entities/credential-context.entity';
import { CredentialOwner } from '../entities/credential-owner.entity';
import {
  secretValue,
  type CredentialConsumerType,
  type CredentialSecret,
  type CredentialValidationResult,
} from '../credential.types';
import { Credential } from '../entities/credential.entity';
import { CUSTOM_CONNECTOR_DEFINITION_ID } from './builtin-credential-definitions';

/** A rotation lease older than this is free again, so a crashed holder blocks no one for longer. */
export const ROTATION_LEASE_STALE_MS = 60_000;

/** Who a new Credential belongs to and which Contexts it joins. */
export interface NewCredentialAccess {
  /** The creating member, first owner, checked against the project; null saves copies unchecked. */
  readonly createdBy: AuthorizationContext | null;
  readonly ownerIds: readonly string[];
  readonly contextIds: readonly string[];
}

@Injectable()
export class CredentialService {
  /** The last pending secret write of each Credential, so writes on one Credential run in turn. */
  private readonly secretWrites = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    @InjectRepository(CredentialConsumerBinding)
    private readonly bindings: Repository<CredentialConsumerBinding>,
    @InjectRepository(CredentialOwner)
    private readonly owners: Repository<CredentialOwner>,
    @InjectRepository(CredentialContext)
    private readonly credentialContexts: Repository<CredentialContext>,
    private readonly idpProjections: IdpProjectionsFacade,
    private readonly contexts: ContextService
  ) {}

  create(input: Partial<Credential>): Credential {
    return this.credentials.create(input);
  }

  /** Saves a new Credential with its owners and Contexts; the caller sets its sharing defaults. */
  @Transactional()
  async createWithAccess(
    fields: Partial<Credential> & Pick<Credential, 'projectId'>,
    access: NewCredentialAccess
  ): Promise<Credential> {
    const { createdBy } = access;
    const credential = await this.credentials.save(
      this.credentials.create({ ...fields, createdById: createdBy?.userId ?? null })
    );
    const ownerIds = [...new Set([...(createdBy ? [createdBy.userId] : []), ...access.ownerIds])];
    const contextIds = [...new Set(access.contextIds)];
    const toOwner = (userId: string) => this.owners.create({ credentialId: credential.id, userId });
    if (createdBy) {
      await syncOwners(
        this.owners,
        'credentialId',
        credential.id,
        credential.projectId,
        ownerIds,
        this.idpProjections,
        toOwner
      );
      await this.contexts.validateContextIds(contextIds, credential.projectId);
    } else {
      await this.owners.save(ownerIds.map(toOwner));
    }
    await this.credentialContexts.save(
      contextIds.map(contextId =>
        this.credentialContexts.create({ credentialId: credential.id, contextId })
      )
    );
    return credential;
  }

  save(credential: Credential): Promise<Credential> {
    return this.credentials.save(credential);
  }

  async getByIdAndProjectId(id: string, projectId: string): Promise<Credential> {
    const credential = await this.credentials.findOne({
      where: { id, projectId },
      relations: ['owners', 'contexts', 'contexts.context'],
    });
    if (!credential) {
      throw new NotFoundException(`Credential ${id} was not found`);
    }
    return credential;
  }

  /**
   * Serializes binding and deletion decisions for one active Credential.
   *
   * The no-op UPDATE is intentional: unlike SELECT FOR UPDATE it works for both MySQL and SQLite.
   * Callers must already be inside a transaction so the write lock is held through their final
   * binding or soft-delete decision.
   */
  async lockActiveByIdAndProjectId(id: string, projectId: string): Promise<Credential | null> {
    const lock = await this.credentials
      .createQueryBuilder()
      .update(Credential)
      .set({ modifiedAt: () => 'modifiedAt' })
      .where('id = :id', { id })
      .andWhere('projectId = :projectId', { projectId })
      .andWhere('deletedAt IS NULL')
      .execute();

    // Use the locking UPDATE result instead of a later SELECT to avoid an older REPEATABLE READ
    // snapshot making a Credential deleted by the preceding transaction appear active again.
    if (lock.affected !== 1) return null;

    return this.credentials.findOne({
      where: { id, projectId },
      relations: ['owners', 'contexts', 'contexts.context'],
    });
  }

  /** Runtime lookup by id alone; the caller already resolved the project through its consumer. */
  findById(id: string): Promise<Credential | null> {
    return this.credentials.findOne({ where: { id } });
  }

  listByProjectId(projectId: string): Promise<Credential[]> {
    return this.credentials.find({
      where: { projectId },
      relations: ['owners', 'contexts', 'contexts.context'],
      order: { createdAt: 'DESC' },
    });
  }

  /** The enabled custom connector Credentials of a project, with no secret column read. */
  listEnabledCustomConnectorPublic(
    projectId: string
  ): Promise<Pick<Credential, 'id' | 'title' | 'definitionId' | 'publicMetadata'>[]> {
    return this.credentials.find({
      where: { projectId, definitionId: CUSTOM_CONNECTOR_DEFINITION_ID, enabled: true },
      select: { id: true, title: true, definitionId: true, publicMetadata: true },
      order: { createdAt: 'DESC' },
    });
  }

  listBindings(credentialId: string): Promise<CredentialConsumerBinding[]> {
    return this.bindings.find({ where: { credentialId, active: true } });
  }

  listBindingsOf(credentialIds: readonly string[]): Promise<CredentialConsumerBinding[]> {
    if (credentialIds.length === 0) return Promise.resolve([]);
    return this.bindings.find({ where: { credentialId: In([...credentialIds]), active: true } });
  }

  async getLastUsedAt(credentialId: string): Promise<Date | null> {
    const latest = await this.bindings.findOne({
      where: { credentialId, lastUsedAt: Not(IsNull()) },
      order: { lastUsedAt: 'DESC' },
      select: { lastUsedAt: true },
    });
    return latest?.lastUsedAt ?? null;
  }

  /** On MySQL a locking read, so it counts bindings committed while the caller waited for a lock. */
  countActiveBindings(credentialId: string, exceptBindingId?: string): Promise<number> {
    const query = this.bindings
      .createQueryBuilder('binding')
      .where('binding.credentialId = :credentialId', { credentialId })
      .andWhere('binding.active = :active', { active: true });
    if (exceptBindingId) query.andWhere('binding.id <> :exceptBindingId', { exceptBindingId });
    if (isMysql(this.bindings)) query.setLock('pessimistic_read');
    return query.getCount();
  }

  /** The Credential an active binding names now; on MySQL a locking read that waits for a rebind. */
  async lockBoundCredentialId(key: {
    consumerType: CredentialConsumerType;
    consumerId: string;
    requirementKey: string;
    projectId: string;
  }): Promise<string | null> {
    const query = this.bindings
      .createQueryBuilder('binding')
      .where(
        'binding.consumerType = :consumerType AND binding.consumerId = :consumerId AND binding.requirementKey = :requirementKey AND binding.projectId = :projectId',
        key
      )
      .andWhere('binding.active = :active', { active: true });
    if (isMysql(this.bindings)) query.setLock('pessimistic_write');
    return (await query.getOne())?.credentialId ?? null;
  }

  async softDelete(id: string, projectId: string): Promise<void> {
    await this.credentials.softDelete({ id, projectId });
  }

  /** Writes a validation result only if the stored key is still the one that was checked. */
  async writeValidation(
    id: string,
    checked: Pick<Credential, 'secret' | 'modifiedAt'>,
    result: CredentialValidationResult
  ): Promise<void> {
    await this.updateWhileSecret(id, checked, {
      validationState: result.state,
      validationMessage: result.message.slice(0, 2000),
      validatedAt: result.validatedAt,
    });
  }

  /** Records that the provider refused the stored secret, once per refused key and message. */
  async markRejected(id: string, rejectedSecret: CredentialSecret, message: string): Promise<void> {
    const cut = message.slice(0, 2000);
    const stored = await this.credentials.findOne({
      where: { id },
      select: { id: true, validationState: true, validationMessage: true },
    });
    if (!stored || (stored.validationState === 'rejected' && stored.validationMessage === cut)) {
      return;
    }
    await this.updateWhileSecret(
      id,
      { secret: rejectedSecret },
      {
        validationState: 'rejected',
        validationMessage: cut,
        validatedAt: new Date(),
      }
    );
  }

  /** A refresh keeps the grant, so modifiedAt stays and the grant's validation still applies. */
  async saveRefreshedSecret(
    id: string,
    checked: Pick<Credential, 'secret' | 'modifiedAt'>,
    secret: CredentialSecret
  ): Promise<void> {
    await this.updateWhileSecret(id, checked, { secret, modifiedAt: () => 'modifiedAt' });
  }

  /** Merges `updates` into a fields secret while each `expected` value (undefined: absent) holds. */
  async updateSecretFields(
    credentialId: string,
    projectId: string,
    updates: Readonly<Record<string, string>>,
    expected?: Readonly<Record<string, string | undefined>>,
    connectionExpiresAt?: Date
  ): Promise<{ updated: boolean }> {
    const write = (this.secretWrites.get(credentialId) ?? Promise.resolve()).then(() =>
      this.writeSecretFields(credentialId, projectId, updates, expected, connectionExpiresAt)
    );
    const settled = write.then(
      () => undefined,
      () => undefined
    );
    this.secretWrites.set(credentialId, settled);
    try {
      return await write;
    } finally {
      if (this.secretWrites.get(credentialId) === settled) this.secretWrites.delete(credentialId);
    }
  }

  /** Reads under a row lock on MySQL, so the loser of a race sees the winner's values. */
  @Transactional()
  private async writeSecretFields(
    id: string,
    projectId: string,
    updates: Readonly<Record<string, string>>,
    expected: Readonly<Record<string, string | undefined>> = {},
    connectionExpiresAt?: Date
  ): Promise<{ updated: boolean }> {
    const query = this.credentials
      .createQueryBuilder('credential')
      .where('credential.id = :id AND credential.projectId = :projectId', { id, projectId });
    if (isMysql(this.credentials)) query.setLock('pessimistic_write');
    const credential = await query.getOne();
    if (!credential || !('fields' in credential.secret)) return { updated: false };
    const { fields } = credential.secret;
    const holds = Object.entries(expected).every(
      ([key, value]) => (Object.hasOwn(fields, key) ? fields[key] : undefined) === value
    );
    if (!holds) return { updated: false };

    const metadata = credential.publicMetadata;
    const connection = metadata && 'connection' in metadata ? metadata.connection : undefined;
    await this.credentials.update(
      { id },
      {
        secret: { fields: { ...fields, ...updates } },
        // A stored rotated token shows the provider rotates after all.
        ...(Object.hasOwn(updates, Core.GENERATED_REFRESH_TOKEN_CREDENTIAL_FIELD) && {
          refreshTokenStaticAt: null,
        }),
        ...(connection && connectionExpiresAt
          ? {
              publicMetadata: {
                ...metadata,
                connection: { ...connection, expiresAt: connectionExpiresAt.toISOString() },
              },
            }
          : {}),
      }
    );
    return { updated: true };
  }

  /** The key check is part of the UPDATE, so a key replaced meanwhile keeps its own values. */
  private async updateWhileSecret(
    id: string,
    checked: { readonly secret: CredentialSecret; readonly modifiedAt?: Date },
    values: QueryDeepPartialEntity<Credential>
  ): Promise<void> {
    const mysql = isMysql(this.credentials);
    const query = this.credentials
      .createQueryBuilder()
      .update(Credential)
      .set(values)
      .where('id = :id', { id })
      .andWhere('deletedAt IS NULL');
    if ('value' in checked.secret || !checked.modifiedAt) {
      const storedValue = mysql
        ? "JSON_UNQUOTE(JSON_EXTRACT(secret, '$.value'))"
        : "JSON_EXTRACT(secret, '$.value')";
      query.andWhere(`${storedValue} = :secretValue`, {
        secretValue: secretValue(checked.secret),
      });
    } else if (mysql) {
      // Other kinds hold no single value; match the row version to the millisecond a Date keeps.
      query.andWhere('modifiedAt >= :modifiedAtFrom AND modifiedAt < :modifiedAtTo', {
        modifiedAtFrom: checked.modifiedAt,
        modifiedAtTo: new Date(checked.modifiedAt.getTime() + 1),
      });
    } else {
      query.andWhere(
        "strftime('%Y-%m-%d %H:%M:%f', modifiedAt) = strftime('%Y-%m-%d %H:%M:%f', :modifiedAt)",
        { modifiedAt: checked.modifiedAt.toISOString() }
      );
    }
    await query.execute();
  }

  /** A cross-pod lease, null while another run holds it; modifiedAt stays for the key checks and the rollout. */
  async claimRotation(id: string): Promise<string | null> {
    const now = new Date();
    const leaseId = randomUUID();
    const claim = await this.credentials
      .createQueryBuilder()
      .update(Credential)
      .set({ rotationLeaseId: leaseId, rotationLeaseAt: now, modifiedAt: () => 'modifiedAt' })
      .where('id = :id', { id })
      .andWhere('(rotationLeaseAt IS NULL OR rotationLeaseAt <= :stale)', {
        stale: new Date(now.getTime() - ROTATION_LEASE_STALE_MS),
      })
      .execute();
    return claim.affected === 1 ? leaseId : null;
  }

  /** Clears the lease only for its holder. Best-effort: a lease left behind goes stale. */
  async releaseRotation(id: string, leaseId: string): Promise<void> {
    try {
      await this.credentials
        .createQueryBuilder()
        .update(Credential)
        .set({ rotationLeaseId: null, rotationLeaseAt: null, modifiedAt: () => 'modifiedAt' })
        .where('id = :id', { id })
        .andWhere('rotationLeaseId = :leaseId', { leaseId })
        .execute();
    } catch {
      // Deliberately ignored: the lease frees itself after ROTATION_LEASE_STALE_MS.
    }
  }

  /** Records that a leased run ended without a rotated token; best-effort, and modifiedAt stays as for a lease. */
  async markRefreshTokenStatic(id: string): Promise<void> {
    try {
      await this.credentials
        .createQueryBuilder()
        .update(Credential)
        .set({ refreshTokenStaticAt: new Date(), modifiedAt: () => 'modifiedAt' })
        .where('id = :id', { id })
        .andWhere('refreshTokenStaticAt IS NULL')
        .execute();
    } catch {
      // Deliberately ignored: without the marker the next run only takes the lease again.
    }
  }

  /** Best-effort and throttled: runtime success must never depend on usage telemetry. */
  async markLastUsed(
    input: {
      readonly credentialId: string;
      readonly consumerType: CredentialConsumerType;
      readonly consumerId: string;
      readonly requirementKey: string;
    },
    now = new Date()
  ): Promise<void> {
    const threshold = new Date(now.getTime() - 5 * 60 * 1000);
    try {
      await this.bindings
        .createQueryBuilder()
        .update(CredentialConsumerBinding)
        .set({ lastUsedAt: now })
        .where('credentialId = :credentialId', { credentialId: input.credentialId })
        .andWhere('consumerType = :consumerType', { consumerType: input.consumerType })
        .andWhere('consumerId = :consumerId', { consumerId: input.consumerId })
        .andWhere('requirementKey = :requirementKey', {
          requirementKey: input.requirementKey,
        })
        .andWhere('active = :active', { active: true })
        .andWhere('(lastUsedAt IS NULL OR lastUsedAt < :threshold)', { threshold })
        .execute();
    } catch {
      // Deliberately ignored: this field is informational and cannot break a consumer.
    }
  }
}

function isMysql(repository: Repository<object>): boolean {
  return ['mysql', 'mariadb'].includes(repository.manager.connection.options.type);
}
