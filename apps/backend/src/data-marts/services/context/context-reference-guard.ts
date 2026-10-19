import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { ContextReferenceGuard } from '../../entities/context-reference-guard.entity';

export async function contextRevision(manager: EntityManager, projectId: string): Promise<number> {
  return (
    (await manager.getRepository(ContextReferenceGuard).findOneBy({ projectId }))?.revision ?? 0
  );
}

/** Caller must keep this manager's transaction open until all reference changes finish. */
export async function lockContextReferences(
  manager: EntityManager,
  projectId: string,
  expectedRevision?: number,
  advance = true
): Promise<number> {
  if (!manager.queryRunner?.isTransactionActive)
    throw new Error('Context reference guard requires a transaction');
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
  ) {
    throw new BadRequestException('expectedRevision must be a nonnegative safe integer');
  }
  const repository = manager.getRepository(ContextReferenceGuard);
  await repository
    .createQueryBuilder()
    .insert()
    .values({ projectId, revision: 0 })
    .orUpdate(['projectId'], ['projectId'])
    .execute();
  const update = repository
    .createQueryBuilder()
    .update()
    .set({ revision: () => (advance ? 'revision + 1' : 'revision') })
    .where('projectId = :projectId', { projectId });
  if (expectedRevision !== undefined)
    update.andWhere('revision = :expectedRevision', { expectedRevision });
  if ((await update.execute()).affected !== 1)
    throw new ConflictException('Context configuration changed; read it again');
  return contextRevision(manager, projectId);
}

export function contextImpactDigest(
  projectId: string,
  revision: number,
  action: string,
  target: string,
  change: unknown
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical([projectId, revision, action, target, change])))
    .digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  return value;
}

/** In a pre-existing MySQL transaction use a current read, not an older repeatable-read snapshot. */
export function contextCurrentReadLock(
  manager: EntityManager
): { mode: 'pessimistic_read' } | undefined {
  return manager.queryRunner?.isTransactionActive &&
    ['mysql', 'mariadb'].includes(manager.connection.options.type)
    ? { mode: 'pessimistic_read' }
    : undefined;
}
