import { BadRequestException, ConflictException } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { serializeSqliteTransactions } from '../../config/sqlite-transaction-serializer';
import { CreateMutationReceipts1792401000000 } from '../../migrations/1792401000000-create-mutation-receipts';
import { MutationReceipt } from './mutation-receipt.entity';
import { MutationReceiptService } from './mutation-receipt.service';

describe('MutationReceiptService persistence', () => {
  let directory: string;
  let database: DataSource;
  const service = new MutationReceiptService();
  const identity = {
    projectId: 'project-1',
    userId: 'user-1',
    action: 'create_context',
    resourceId: 'project-1',
    operationId: 'logical-request-1',
  };
  const intent = { name: 'Context', expectedRevision: 0 };

  function connect() {
    return serializeSqliteTransactions(
      new DataSource({
        type: 'better-sqlite3',
        database: join(directory, 'receipts.sqlite'),
        entities: [MutationReceipt],
        migrations: [CreateMutationReceipts1792401000000],
        migrationsRun: true,
      })
    );
  }

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'mutation-receipts-'));
    database = connect();
    await database.initialize();
    await database.query('CREATE TABLE effects (id varchar PRIMARY KEY)');
  });

  afterEach(async () => {
    if (database.isInitialized) await database.destroy();
    rmSync(directory, { recursive: true, force: true });
  });

  it('recovers a committed result after reconnect without repeating the local effect', async () => {
    await database.transaction(async manager => {
      const reservation = await service.reserve(manager, identity, intent);
      expect(reservation.claimed).toBe(true);
      await manager.query('INSERT INTO effects (id) VALUES (?)', ['context-1']);
      await service.complete(manager, reservation.receipt.id, {
        resourceId: 'context-1',
        revision: 1,
      });
    });
    await database.destroy();
    database = connect();
    await database.initialize();
    const recovered = await database.transaction(manager =>
      new MutationReceiptService().reserve(manager, identity, intent)
    );
    expect(recovered.claimed).toBe(false);
    expect(recovered.receipt).toMatchObject({
      status: 'completed',
      result: { resourceId: 'context-1', revision: 1 },
    });
    expect(await database.query('SELECT * FROM effects')).toEqual([{ id: 'context-1' }]);
  });

  it('finds no prior receipt without reserving one', async () => {
    expect(
      await database.transaction(manager => service.findExisting(manager, identity, intent))
    ).toBeNull();
    expect(await database.getRepository(MutationReceipt).count()).toBe(0);
  });

  it('read-only lookup uses canonical intent and rejects changed payload', async () => {
    const original = await database.transaction(manager =>
      service.reserve(manager, identity, intent)
    );
    const before = await database
      .getRepository(MutationReceipt)
      .findOneByOrFail({ id: original.receipt.id });
    expect(
      await database.transaction(manager =>
        service.findExisting(manager, identity, { expectedRevision: 0, name: 'Context' })
      )
    ).toMatchObject({ id: original.receipt.id, status: 'incomplete' });
    await expect(
      database.transaction(manager =>
        service.findExisting(manager, identity, { ...intent, expectedRevision: 1 })
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      await database.getRepository(MutationReceipt).findOneByOrFail({ id: original.receipt.id })
    ).toEqual(before);
  });

  it('read-only lookup keeps every identity dimension separate', async () => {
    await database.transaction(manager => service.reserve(manager, identity, intent));
    for (const field of ['projectId', 'userId', 'action', 'resourceId', 'operationId'] as const) {
      expect(
        await database.transaction(manager =>
          service.findExisting(
            manager,
            { ...identity, [field]: identity[field] + '-other' },
            intent
          )
        )
      ).toBeNull();
    }
    expect(await database.getRepository(MutationReceipt).count()).toBe(1);
  });

  it('read-only lookup recovers durable unknown state after reconnect without promoting or dispatching', async () => {
    await database.transaction(async manager => {
      const original = await service.reserve(manager, identity, intent);
      await service.markUnknown(manager, original.receipt.id);
    });
    await database.destroy();
    database = connect();
    await database.initialize();
    expect(
      await database.transaction(manager => service.findExisting(manager, identity, intent))
    ).toMatchObject({ status: 'unknown', result: null });
    expect(await database.getRepository(MutationReceipt).count()).toBe(1);
    expect(await database.query('SELECT * FROM effects')).toEqual([]);
  });

  it('rolls receipt and local effect back together, permitting a safe fresh claim', async () => {
    await expect(
      database.transaction(async manager => {
        await service.reserve(manager, identity, intent);
        await manager.query('INSERT INTO effects (id) VALUES (?)', ['rolled-back']);
        throw new Error('domain CAS failed');
      })
    ).rejects.toThrow('domain CAS failed');
    expect(await database.query('SELECT * FROM effects')).toEqual([]);
    expect(await database.getRepository(MutationReceipt).count()).toBe(0);
    expect(
      await database.transaction(manager => service.reserve(manager, identity, intent))
    ).toMatchObject({ claimed: true });
  });

  it('allows one claimant for concurrent identical requests', async () => {
    const results = await Promise.all([
      database.transaction(manager => service.reserve(manager, identity, intent)),
      database.transaction(manager => service.reserve(manager, identity, intent)),
    ]);
    expect(results.filter(result => result.claimed)).toHaveLength(1);
    expect(results[0].receipt.id).toBe(results[1].receipt.id);
    expect(await database.getRepository(MutationReceipt).count()).toBe(1);
  });

  it('matches reordered object keys but conflicts on changed payload including revision', async () => {
    await database.transaction(manager => service.reserve(manager, identity, intent));
    expect(
      await database.transaction(manager =>
        service.reserve(manager, identity, { expectedRevision: 0, name: 'Context' })
      )
    ).toMatchObject({ claimed: false });
    await expect(
      database.transaction(manager =>
        service.reserve(manager, identity, { ...intent, expectedRevision: 1 })
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(['projectId', 'userId', 'action', 'resourceId', 'operationId'] as const)(
    'does not merge identical payloads across %s identity',
    async field => {
      await database.transaction(manager => service.reserve(manager, identity, intent));
      expect(
        await database.transaction(manager =>
          service.reserve(manager, { ...identity, [field]: `${identity[field]}-other` }, intent)
        )
      ).toMatchObject({ claimed: true });
    }
  );

  it('retains unknown external outcome on retry and requires explicit reconciliation', async () => {
    const original = await database.transaction(async manager => {
      const reservation = await service.reserve(manager, identity, intent);
      await service.markUnknown(manager, reservation.receipt.id);
      return reservation;
    });
    const recovered = await database.transaction(manager =>
      service.reserve(manager, identity, intent)
    );
    expect(recovered).toMatchObject({
      claimed: false,
      receipt: { status: 'unknown', result: null },
    });
    await database.transaction(manager =>
      service.complete(manager, original.receipt.id, { resourceId: 'external-1', state: 'created' })
    );
    await expect(
      database.transaction(manager => service.markUnknown(manager, original.receipt.id))
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not overwrite a completed reference with a different result', async () => {
    const reservation = await database.transaction(manager =>
      service.reserve(manager, identity, intent)
    );
    await database.transaction(manager =>
      service.complete(manager, reservation.receipt.id, { resourceId: 'context-1', deleted: true })
    );
    await database.transaction(manager =>
      service.complete(manager, reservation.receipt.id, { deleted: true, resourceId: 'context-1' })
    );
    await expect(
      database.transaction(manager =>
        service.complete(manager, reservation.receipt.id, { resourceId: 'wrong-object' })
      )
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses writes outside the caller transaction', async () => {
    await expect(service.reserve(database.manager, identity, intent)).rejects.toThrow(
      'transaction'
    );
    await expect(service.findExisting(database.manager, identity, intent)).rejects.toThrow(
      'transaction'
    );
    await expect(service.markUnknown(database.manager, 'missing')).rejects.toThrow('transaction');
    await expect(
      service.complete(database.manager, 'missing', { resourceId: 'context-1' })
    ).rejects.toThrow('transaction');
  });

  it('rejects non-JSON intent and unapproved result fields without storing payload text', async () => {
    await expect(
      database.transaction(manager => service.reserve(manager, identity, { revision: undefined }))
    ).rejects.toBeInstanceOf(BadRequestException);
    const reservation = await database.transaction(manager =>
      service.reserve(manager, identity, intent)
    );
    await expect(
      database.transaction(manager =>
        service.complete(manager, reservation.receipt.id, {
          resourceId: 'context-1',
          token: 'must-not-persist',
        } as never)
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    const stored = await database.query('SELECT * FROM mutation_receipt');
    expect(JSON.stringify(stored)).not.toContain('Context');
    expect(JSON.stringify(stored)).not.toContain('must-not-persist');
  });

  it('rejects sparse arrays instead of hashing missing entries as JSON values', async () => {
    await expect(
      database.transaction(manager => service.reserve(manager, identity, { entries: Array(1) }))
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(await database.getRepository(MutationReceipt).count()).toBe(0);
  });
});
