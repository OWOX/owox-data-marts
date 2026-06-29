import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DataStorage } from '../entities/data-storage.entity';
import { DataStorageCredential } from '../entities/data-storage-credential.entity';
import { StorageOwner } from '../entities/storage-owner.entity';
import { StorageContext } from '../entities/storage-context.entity';
import { Context } from '../entities/context.entity';
import { MemberRoleContext } from '../entities/member-role-context.entity';
import { DataStorageType } from '../data-storage-types/enums/data-storage-type.enum';
import { RoleScope } from '../enums/role-scope.enum';
import {
  applyDataStorageVisibilityFilter,
  DataStorageVisibilityFilterOptions,
} from './apply-data-storage-visibility-filter';

const TEST_ENTITIES = [
  DataStorage,
  DataStorageCredential,
  StorageOwner,
  StorageContext,
  Context,
  MemberRoleContext,
];

describe('applyDataStorageVisibilityFilter', () => {
  let dataSource: DataSource;
  let storageRepo: Repository<DataStorage>;
  let contextRepo: Repository<Context>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          entities: TEST_ENTITIES,
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([DataStorage, Context]),
      ],
    }).compile();

    dataSource = module.get(getDataSourceToken());
    storageRepo = module.get(getRepositoryToken(DataStorage));
    contextRepo = module.get(getRepositoryToken(Context));
  }, 30_000);

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM member_role_contexts');
    await dataSource.query('DELETE FROM storage_owners');
    await dataSource.query('DELETE FROM storage_contexts');
    await dataSource.query('DELETE FROM data_storage');
    await dataSource.query('DELETE FROM context');
  });

  async function seedStorage(
    overrides: Partial<DataStorage> = {},
    projectId = 'proj-1'
  ): Promise<DataStorage> {
    const s = storageRepo.create();
    s.type = DataStorageType.GOOGLE_BIGQUERY;
    s.projectId = projectId;
    s.createdById = 'creator';
    Object.assign(s, overrides);
    return storageRepo.save(s);
  }

  async function seedContext(name: string, projectId = 'proj-1'): Promise<Context> {
    const ctx = contextRepo.create();
    ctx.name = name;
    ctx.projectId = projectId;
    return contextRepo.save(ctx);
  }

  function query(opts: DataStorageVisibilityFilterOptions): Promise<DataStorage[]> {
    let qb = storageRepo
      .createQueryBuilder('s')
      .where('s.projectId = :projectId', { projectId: opts.projectId })
      .andWhere('s.deletedAt IS NULL');
    qb = applyDataStorageVisibilityFilter(qb, opts);
    return qb.getMany();
  }

  it('admin sees all storages regardless of sharing flags', async () => {
    await seedStorage({ availableForUse: false, availableForMaintenance: false });
    const results = await query({
      storageAlias: 's',
      projectId: 'proj-1',
      userId: 'admin-user',
      roles: ['admin'],
    });
    expect(results).toHaveLength(1);
  });

  it('no userId returns all storages (system call path)', async () => {
    await seedStorage({ availableForUse: false, availableForMaintenance: false });
    const results = await query({
      storageAlias: 's',
      projectId: 'proj-1',
    });
    expect(results).toHaveLength(1);
  });

  describe('viewer (non-editor) role branch', () => {
    it('viewer sees only owned storages — excludes unshared non-owned', async () => {
      await seedStorage({ availableForUse: false, availableForMaintenance: false });
      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'viewer-1',
        roles: ['viewer'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(0);
    });

    it('viewer sees a storage they own via storage_owners', async () => {
      const s = await seedStorage({ availableForUse: false, availableForMaintenance: false });
      await dataSource.query('INSERT INTO storage_owners (storage_id, user_id) VALUES (?, ?)', [
        s.id,
        'viewer-1',
      ]);

      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'viewer-1',
        roles: ['viewer'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('viewer does NOT see availableForUse storages they do not own', async () => {
      await seedStorage({ availableForUse: true, availableForMaintenance: false });
      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'viewer-1',
        roles: ['viewer'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(0);
    });
  });

  describe('editor role branch', () => {
    it('editor sees owned storages', async () => {
      const s = await seedStorage({ availableForUse: false, availableForMaintenance: false });
      await dataSource.query('INSERT INTO storage_owners (storage_id, user_id) VALUES (?, ?)', [
        s.id,
        'editor-1',
      ]);

      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('editor sees availableForUse storages they do not own (ENTIRE_PROJECT scope)', async () => {
      await seedStorage({ availableForUse: true, availableForMaintenance: false });
      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('editor sees availableForMaintenance storages (ENTIRE_PROJECT scope)', async () => {
      await seedStorage({ availableForUse: false, availableForMaintenance: true });
      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(1);
    });

    it('editor does NOT see unshared non-owned storage', async () => {
      await seedStorage({ availableForUse: false, availableForMaintenance: false });
      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.ENTIRE_PROJECT,
      });
      expect(results).toHaveLength(0);
    });

    it('editor with SELECTED_CONTEXTS sees shared storage only if context overlaps', async () => {
      const s = await seedStorage({ availableForUse: true, availableForMaintenance: false });
      const ctx = await seedContext('finance');

      await dataSource.query(
        'INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)',
        [s.id, ctx.id]
      );
      await dataSource.query(
        'INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)',
        ['editor-1', 'proj-1', ctx.id]
      );

      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      expect(results).toHaveLength(1);
    });

    it('editor with SELECTED_CONTEXTS is excluded when context does not overlap', async () => {
      await seedStorage({ availableForUse: true, availableForMaintenance: false });

      const results = await query({
        storageAlias: 's',
        projectId: 'proj-1',
        userId: 'editor-1',
        roles: ['editor'],
        roleScope: RoleScope.SELECTED_CONTEXTS,
      });
      expect(results).toHaveLength(0);
    });
  });
});
