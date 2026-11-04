import { DataSource, type Repository } from 'typeorm';
import { SystemTimeService } from '../../../common/scheduler/services/system-time.service';
import { CreateCredentialSetup1793628000000 } from '../../../migrations/1793628000000-create-credential-setup';
import { CredentialSetup } from '../entities/credential-setup.entity';
import { CredentialSetupService } from '../services/credential-setup.service';
import { CleanupCredentialSetupsService } from './cleanup-credential-setups.service';

describe('Credential setup cleanup', () => {
  let database: DataSource;
  let repository: Repository<CredentialSetup>;
  let cleanup: CleanupCredentialSetupsService;
  const now = new Date('2030-01-01T12:00:00.000Z');
  const expired = {
    projectId: 'project',
    userId: 'user',
    mode: 'create' as const,
    status: 'completed' as const,
    definitionId: 'github',
    credentialId: '00000000-0000-4000-8000-000000000001',
    createdAt: new Date('2030-01-01T11:29:00.000Z'),
    expiresAt: new Date('2030-01-01T11:44:00.000Z'),
    completedAt: new Date('2030-01-01T11:40:00.000Z'),
  };

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
    cleanup = new CleanupCredentialSetupsService(new CredentialSetupService(repository), {
      now: () => now,
    } as SystemTimeService);
  });

  beforeEach(() => repository.clear());
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (database?.isInitialized) await database.destroy();
  });

  it('stops between bounded batches and removes the remaining rows on the next run', async () => {
    await repository.save(Array.from({ length: 501 }, () => ({ ...expired })));
    const abort = new AbortController();
    const remove = repository.delete.bind(repository);
    jest.spyOn(repository, 'delete').mockImplementationOnce(async criteria => {
      const result = await remove(criteria);
      abort.abort();
      return result;
    });

    const removed = await cleanup.run(abort.signal);
    const remaining = await repository.count();
    expect(removed).toBeGreaterThan(0);
    expect(remaining).toBeGreaterThan(0);
    expect(removed + remaining).toBe(501);
    await expect(cleanup.run()).resolves.toBe(remaining);
    expect(await repository.count()).toBe(0);
    await expect(cleanup.run()).resolves.toBe(0);
  });

  it('keeps rows when shutdown has already cancelled the task', async () => {
    await repository.save(expired);
    await expect(cleanup.run(AbortSignal.abort())).resolves.toBe(0);
    expect(await repository.count()).toBe(1);
  });

  it('stores a suggested title and keeps the setup when creation is repeated', async () => {
    const row = await repository.save({ ...expired, title: 'Marketing access' });
    const runner = database.createQueryRunner();
    try {
      await new CreateCredentialSetup1793628000000().up(runner);
      expect(await repository.findOneBy({ id: row.id })).toEqual(row);
    } finally {
      await runner.release();
    }
  });

  it('repairs the cleanup index after table creation was interrupted', async () => {
    const row = await repository.save(expired);
    const runner = database.createQueryRunner();
    try {
      await runner.dropIndex('credential_setup', 'idx_credential_setup_created_at');
      await new CreateCredentialSetup1793628000000().up(runner);
      const table = await runner.getTable('credential_setup');
      expect(table?.indices).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'idx_credential_setup_created_at',
            columnNames: ['createdAt'],
          }),
        ])
      );
      expect(await repository.findOneBy({ id: row.id })).toEqual(row);
    } finally {
      await runner.release();
    }
  });
});
