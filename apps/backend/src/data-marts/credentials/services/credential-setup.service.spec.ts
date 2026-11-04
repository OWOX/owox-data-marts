import { NotFoundException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import { CreateCredentialSetup1793628000000 } from '../../../migrations/1793628000000-create-credential-setup';
import { CredentialSetup } from '../entities/credential-setup.entity';
import { CredentialSetupService } from './credential-setup.service';

describe('Credential setup persistence', () => {
  let database: DataSource;
  let repository: Repository<CredentialSetup>;
  let service: CredentialSetupService;
  const actor = { projectId: 'project', userId: 'owner' };
  const now = new Date('2026-11-02T12:00:00.000Z');
  const expiresAt = new Date('2026-11-02T12:15:00.000Z');

  beforeAll(async () => {
    database = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [CredentialSetup],
      migrations: [CreateCredentialSetup1793628000000],
    });
    await database.initialize();
    await database.runMigrations();
    repository = database.getRepository(CredentialSetup);
    service = new CredentialSetupService(repository);
  });

  beforeEach(() => repository.clear());
  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  function create() {
    return service.create({
      ...actor,
      mode: 'create',
      definitionId: null,
      credentialId: null,
      title: null,
      createdAt: now,
      expiresAt,
    });
  }

  it.each(['completed', 'cancelled'] as const)(
    'keeps %s terminal when competing requests both read pending before writing',
    async status => {
      const row = await create();
      const first = await service.getOwned(row.id, actor);
      const second = await service.getOwned(row.id, actor);
      expect(first.status).toBe('pending');
      expect(second.status).toBe('pending');
      const credentialId = status === 'completed' ? 'first-credential' : null;
      expect(await service.finish(first.id, actor, status, credentialId, now)).toBe(true);
      const winner = await service.getOwned(row.id, actor);
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(await service.finish(second.id, actor, 'completed', 'other-credential', now)).toBe(
          false
        );
        expect(await service.finish(second.id, actor, 'cancelled', null, now)).toBe(false);
        expect(await service.getOwned(row.id, actor)).toEqual(winner);
      }
      expect(winner).toMatchObject({ status, credentialId, completedAt: now });
    }
  );

  it.each([
    { projectId: 'other-project', userId: actor.userId },
    { projectId: actor.projectId, userId: 'other-user' },
  ])('hides and protects requests outside their owner and project: %j', async outsider => {
    const row = await create();
    await expect(service.getOwned(row.id, outsider)).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.finish(row.id, outsider, 'cancelled', null, now)).toBe(false);
    expect((await service.getOwned(row.id, actor)).status).toBe('pending');
  });

  it.each(['completed', 'cancelled'] as const)(
    'rejects a %s write if the request expires after it was read',
    async status => {
      const row = await create();
      expect((await service.getOwned(row.id, actor)).status).toBe('pending');
      expect(await service.finish(row.id, actor, status, 'credential', expiresAt)).toBe(false);
      expect(await service.getOwned(row.id, actor)).toMatchObject({
        status: 'pending',
        credentialId: null,
        completedAt: null,
      });
    }
  );
});
