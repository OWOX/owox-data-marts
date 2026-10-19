import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { EntityManager, In } from 'typeorm';
import { MutationReceipt, MutationResultReference } from './mutation-receipt.entity';

export interface MutationIdentity {
  projectId: string;
  userId: string;
  action: string;
  resourceId: string;
  operationId: string;
}

/** Persistence only: callers own authorization, transactions, CAS and effects. */
@Injectable()
export class MutationReceiptService {
  async reserve(
    manager: EntityManager,
    identity: MutationIdentity,
    nonSecretIntent: unknown
  ): Promise<{ claimed: boolean; receipt: MutationReceipt }> {
    this.requireTransaction(manager);
    const identityHash = this.hashIdentity(identity);
    const intentHash = this.hash(nonSecretIntent);
    const id = randomUUID();
    const repository = manager.getRepository(MutationReceipt);
    // As in ProjectSettingsService, a no-op upsert takes an exclusive MySQL duplicate-key lock.
    await repository
      .createQueryBuilder()
      .insert()
      .values({ id, identityHash, intentHash, status: 'incomplete', result: null })
      .orUpdate(['identityHash'], ['identityHash'])
      .execute();
    const receipt = await repository.findOneOrFail({
      where: { identityHash },
      // A current read also works when earlier domain reads established a MySQL snapshot.
      ...(manager.connection.options.type === 'mysql'
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
    });
    if (receipt.intentHash !== intentHash) {
      throw new ConflictException('Operation identity was already used with different intent');
    }
    return { claimed: receipt.id === id, receipt };
  }

  /** Read-only recovery hint; callers still authorize and reserve at the write boundary. */
  async findExisting(
    manager: EntityManager,
    identity: MutationIdentity,
    nonSecretIntent: unknown
  ): Promise<MutationReceipt | null> {
    this.requireTransaction(manager);
    const identityHash = this.hashIdentity(identity);
    const intentHash = this.hash(nonSecretIntent);
    const receipt = await manager.getRepository(MutationReceipt).findOneBy({ identityHash });
    if (receipt && receipt.intentHash !== intentHash)
      throw new ConflictException('Operation identity was already used with different intent');
    return receipt;
  }

  /** Commit this transition BEFORE issuing an external effect that may have an ambiguous outcome. */
  async markUnknown(manager: EntityManager, receiptId: string): Promise<void> {
    this.requireTransaction(manager);
    const updated = await manager
      .getRepository(MutationReceipt)
      .update({ id: receiptId, status: 'incomplete' }, { status: 'unknown' });
    if (updated.affected !== 1) {
      throw new ConflictException('Operation is no longer available for first dispatch');
    }
  }

  async complete(
    manager: EntityManager,
    receiptId: string,
    result: MutationResultReference
  ): Promise<void> {
    this.requireTransaction(manager);
    this.validateReference(result);
    const repository = manager.getRepository(MutationReceipt);
    const updated = await repository.update(
      { id: receiptId, status: In(['incomplete', 'unknown']) },
      { status: 'completed', result }
    );
    if (updated.affected === 1) return;
    const receipt = await repository.findOne({
      where: { id: receiptId },
      ...(manager.connection.options.type === 'mysql'
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
    });
    if (receipt?.status === 'completed' && this.hash(receipt.result) === this.hash(result)) return;
    throw new ConflictException('Operation result is absent or already completed differently');
  }

  private hashIdentity(identity: MutationIdentity): string {
    const identityValues = [
      identity.projectId,
      identity.userId,
      identity.action,
      identity.resourceId,
      identity.operationId,
    ];
    if (
      identityValues.some(value => typeof value !== 'string' || !value.trim() || value.length > 255)
    ) {
      throw new BadRequestException('Operation identity requires bounded, non-empty identifiers');
    }
    return this.hash(identityValues);
  }

  private requireTransaction(manager: EntityManager): void {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Mutation receipts require the domain transaction EntityManager');
    }
  }

  private validateReference(result: MutationResultReference): void {
    const stringFields = ['resourceId', 'runId', 'triggerId', 'versionId', 'state'];
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new BadRequestException('Operation result must be a safe reference');
    }
    if (
      typeof result.resourceId !== 'string' ||
      !result.resourceId.trim() ||
      Object.entries(result).some(([key, value]) => {
        if (stringFields.includes(key)) {
          return typeof value !== 'string' || !value.trim() || value.length > 255;
        }
        if (key === 'revision') return !Number.isSafeInteger(value) || (value as number) < 0;
        if (key === 'deleted') return typeof value !== 'boolean';
        return true;
      })
    ) {
      throw new BadRequestException('Operation result contains an invalid reference field');
    }
  }

  private hash(value: unknown): string {
    const ancestors = new Set<object>();
    const canonical = (item: unknown): string => {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') {
        return JSON.stringify(item);
      }
      if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
      if (typeof item !== 'object' || ancestors.has(item)) {
        throw new BadRequestException('Operation intent must contain only finite JSON values');
      }
      const prototype = Object.getPrototypeOf(item);
      if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null) {
        throw new BadRequestException('Operation intent must contain only plain JSON objects');
      }
      ancestors.add(item);
      const serialized = Array.isArray(item)
        ? `[${Array.from(item, canonical).join(',')}]`
        : `{${Object.keys(item)
            .sort()
            .map(
              key => `${JSON.stringify(key)}:${canonical((item as Record<string, unknown>)[key])}`
            )
            .join(',')}}`;
      ancestors.delete(item);
      return serialized;
    };
    return createHash('sha256').update(canonical(value)).digest('hex');
  }
}
