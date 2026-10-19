import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { serializeSqliteTransactions } from '../../config/sqlite-transaction-serializer';
import { ProjectSettings } from '../entities/project-settings.entity';
import { ProjectSettingsService } from './project-settings.service';

describe('ProjectSettingsService persistence', () => {
  let database: DataSource;
  let service: ProjectSettingsService;

  beforeEach(async () => {
    database = serializeSqliteTransactions(
      new DataSource({
        type: 'better-sqlite3',
        database: ':memory:',
        entities: [ProjectSettings],
        synchronize: true,
      })
    );
    await database.initialize();
    service = new ProjectSettingsService(database.getRepository(ProjectSettings));
  });

  afterEach(async () => {
    await database.destroy();
  });

  it('isolates project settings and reads an absent project as null', async () => {
    await service.saveDescription('project-1', 'One', 0);
    expect(await service.findByProjectId('project-2')).toBeNull();
    expect(await service.findByProjectId('project-1')).toMatchObject({
      description: 'One',
      revision: 1,
    });
  });

  it('allows exactly one simultaneous first save and rejects the loser without changing content', async () => {
    const results = await Promise.allSettled([
      service.saveDescription('project-1', 'First', 0),
      service.saveDescription('project-1', 'Second', 0),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    const winner = results.find(
      result => result.status === 'fulfilled'
    ) as PromiseFulfilledResult<ProjectSettings>;
    expect(await service.findByProjectId('project-1')).toMatchObject({
      description: winner.value.description,
      revision: 1,
    });
  });

  it('advances revision on every legacy REST write and invalidates an MCP precondition', async () => {
    await service.saveDescription('project-1', 'MCP', 0);
    await service.saveDescription('project-1', 'Legacy REST');
    await expect(service.saveDescription('project-1', 'Stale MCP', 1)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(await service.findByProjectId('project-1')).toMatchObject({
      description: 'Legacy REST',
      revision: 2,
    });
    await expect(service.saveDescription('project-1', null, 2)).resolves.toMatchObject({
      description: null,
      revision: 3,
    });
  });

  it('prevents concurrent conditional REST and MCP writes from sharing a revision', async () => {
    await service.saveDescription('project-1', 'Original', 0);
    const results = await Promise.allSettled([
      service.saveDescription('project-1', 'REST', 1),
      service.saveDescription('project-1', 'MCP', 1),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(await service.findByProjectId('project-1')).toMatchObject({ revision: 2 });
  });

  it('keeps unconditional overwrite behavior and returns each write own revision', async () => {
    const results = await Promise.all([
      service.saveDescription('project-1', 'First legacy write'),
      service.saveDescription('project-1', 'Second legacy write'),
    ]);
    expect(results.map(result => result.revision)).toEqual([1, 2]);
    expect(results.map(result => result.description)).toEqual([
      'First legacy write',
      'Second legacy write',
    ]);
  });

  it('does not create settings for an impossible nonzero initial revision', async () => {
    await expect(service.saveDescription('project-1', 'Wrong', 4)).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(await service.findByProjectId('project-1')).toBeNull();
  });
});
