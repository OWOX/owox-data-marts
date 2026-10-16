import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { CredentialConsumerBinding } from '../entities/credential-consumer-binding.entity';
import type { CredentialSecret, CredentialValidationResult } from '../credential.types';
import { Credential } from '../entities/credential.entity';

@Injectable()
export class CredentialService {
  constructor(
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    @InjectRepository(CredentialConsumerBinding)
    private readonly bindings: Repository<CredentialConsumerBinding>
  ) {}

  create(input: Partial<Credential>): Credential {
    return this.credentials.create(input);
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

  listByProjectId(projectId: string): Promise<Credential[]> {
    return this.credentials.find({
      where: { projectId },
      relations: ['owners', 'contexts', 'contexts.context'],
      order: { createdAt: 'DESC' },
    });
  }

  listBindings(credentialId: string): Promise<CredentialConsumerBinding[]> {
    return this.bindings.find({ where: { credentialId, active: true } });
  }

  async getLastUsedAt(credentialId: string): Promise<Date | null> {
    const latest = await this.bindings.findOne({
      where: { credentialId, lastUsedAt: Not(IsNull()) },
      order: { lastUsedAt: 'DESC' },
      select: { lastUsedAt: true },
    });
    return latest?.lastUsedAt ?? null;
  }

  countActiveBindings(credentialId: string): Promise<number> {
    return this.bindings.count({ where: { credentialId, active: true } });
  }

  async softDelete(id: string, projectId: string): Promise<void> {
    await this.credentials.softDelete({ id, projectId });
  }

  /** Writes a validation result only if the stored key is still the one that was checked. */
  async writeValidation(
    id: string,
    checkedSecret: CredentialSecret,
    result: CredentialValidationResult
  ): Promise<void> {
    await this.updateValidationWhileSecret(id, checkedSecret, {
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
    await this.updateValidationWhileSecret(id, rejectedSecret, {
      validationState: 'rejected',
      validationMessage: cut,
      validatedAt: new Date(),
    });
  }

  /** The key check is part of the UPDATE, so a key replaced meanwhile keeps its own validation. */
  private async updateValidationWhileSecret(
    id: string,
    secret: CredentialSecret,
    values: Pick<Credential, 'validationState' | 'validationMessage' | 'validatedAt'>
  ): Promise<void> {
    const type = this.credentials.manager.connection.options.type;
    const storedValue =
      type === 'mysql' || type === 'mariadb'
        ? "JSON_UNQUOTE(JSON_EXTRACT(secret, '$.value'))"
        : "JSON_EXTRACT(secret, '$.value')";
    await this.credentials
      .createQueryBuilder()
      .update(Credential)
      .set(values)
      .where('id = :id', { id })
      .andWhere('deletedAt IS NULL')
      .andWhere(`${storedValue} = :secretValue`, { secretValue: secret.value })
      .execute();
  }

  /** Best-effort and throttled: runtime success must never depend on usage telemetry. */
  async markLastUsed(
    input: {
      readonly credentialId: string;
      readonly consumerType: 'plugin-installation';
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
