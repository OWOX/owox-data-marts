import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DataStorageIndexableSource } from './data-storage.source';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataStorageSearchIndex } from '../../entities/search/data-storage-search-index.entity';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { StorageOwner } from '../../entities/storage-owner.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { Context } from '../../entities/context.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { DataMartBusinessOwner } from '../../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../../entities/data-mart-technical-owner.entity';
import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { ConnectorState } from '../../entities/connector-state.entity';
import {
  DataStorageType,
  toHumanReadable,
} from '../../data-storage-types/enums/data-storage-type.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { toCursorTimestamp } from './indexable-source.port';
import type { PageCursor, SourceAccessScope } from './indexable-source.port';
import { describeLoadSearchableOneContract } from './indexable-source.contract';

const TEST_ENTITIES = [
  DataMart,
  DataStorage,
  DataStorageSearchIndex,
  DataStorageCredential,
  DataMartContext,
  DataMartBusinessOwner,
  DataMartTechnicalOwner,
  DataMartRelationship,
  ConnectorState,
  Context,
  StorageOwner,
  StorageContext,
  MemberRoleContext,
];

const STUB_EMBEDDING = Buffer.from(new Float32Array([1, 0]).buffer);

describe('DataStorageIndexableSource', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let source: DataStorageIndexableSource;
  let indexRepo: SearchIndexRepository;
  let storageRepo: Repository<DataStorage>;
  let contextRepo: Repository<Context>;
  const getRoleScope = jest.fn<Promise<RoleScope>, [string, string]>();

  beforeAll(async () => {
    module = await Test.createTestingModule({
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
      providers: [
        DataStorageIndexableSource,
        SearchIndexRepository,
        { provide: ContextAccessService, useValue: { getRoleScope } },
      ],
    }).compile();

    dataSource = module.get(getDataSourceToken());

    source = module.get(DataStorageIndexableSource);
    indexRepo = module.get(SearchIndexRepository);
    storageRepo = module.get(getRepositoryToken(DataStorage));
    contextRepo = module.get(getRepositoryToken(Context));
  }, 30_000);

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM data_storage_search_index');
    await dataSource.query('DELETE FROM member_role_contexts');
    await dataSource.query('DELETE FROM storage_contexts');
    await dataSource.query('DELETE FROM storage_owners');
    await dataSource.query('DELETE FROM context');
    await dataSource.query('DELETE FROM data_storage');
  });

  beforeEach(() => {
    getRoleScope.mockReset();
    getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
  });

  async function seedStorage(
    overrides: Partial<DataStorage> = {},
    projectId = 'proj-1'
  ): Promise<DataStorage> {
    const storage = storageRepo.create();
    storage.type = DataStorageType.GOOGLE_BIGQUERY;
    storage.projectId = projectId;
    storage.createdById = 'user-1';
    storage.availableForUse = true;
    storage.availableForMaintenance = false;
    Object.assign(storage, overrides);
    return storageRepo.save(storage);
  }

  async function seedIndexRow(entityId: string, projectId = 'proj-1'): Promise<void> {
    await indexRepo.upsert(SearchableEntityType.DATA_STORAGE, {
      entityId,
      projectId,
      isDraft: false,
      embedding: STUB_EMBEDDING,
      document: null,
      fieldCount: null,
      docHash: 'hash',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    });
  }

  async function visibleIds(
    projectId: string,
    accessScope?: SourceAccessScope
  ): Promise<Set<string>> {
    const predicate = await source.accessPredicateProvider.build('idx', projectId, accessScope);
    const page = await indexRepo.searchCandidates(
      SearchableEntityType.DATA_STORAGE,
      projectId,
      predicate,
      '',
      { candidateLimit: 1000 }
    );
    return new Set(page.rows.map(r => r.entityId));
  }

  describe('listSearchablePage projection', () => {
    it('projects title and type label without linked context text', async () => {
      const storage = await seedStorage({ title: 'My BigQuery Storage' });

      const ctx = contextRepo.create();
      ctx.name = 'Analytics';
      ctx.description = 'Analytics domain';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);

      await dataSource.query(
        'INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)',
        [storage.id, savedCtx.id]
      );

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors).toHaveLength(1);
      const [descriptor] = page.descriptors;

      expect(descriptor.entityType).toBe(SearchableEntityType.DATA_STORAGE);
      expect(descriptor.entityId).toBe(storage.id);
      expect(descriptor.title).toBe('My BigQuery Storage');
      expect(descriptor.description).toBeNull();
      expect(descriptor.fieldCount).toBe(0);
      expect(descriptor.extendability).toBe(0);

      expect(descriptor.richTextSlots).toEqual([
        { kind: 'title', text: 'My BigQuery Storage' },
        { kind: 'context', text: toHumanReadable(DataStorageType.GOOGLE_BIGQUERY) },
      ]);
    });

    it('emits google SA client email into atomicTokenSlots for BigQuery storage', async () => {
      await seedStorage({ title: 'SA Storage', type: DataStorageType.GOOGLE_BIGQUERY });

      const cred = dataSource.getRepository(DataStorageCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'google-service-account' as never;
      cred.credentials = {} as never;
      cred.identity = { clientEmail: 'sa@project.iam.gserviceaccount.com' };
      const savedCred = await dataSource.getRepository(DataStorageCredential).save(cred);

      const storage = (await storageRepo.findOne({ where: { projectId: 'proj-1' } }))!;
      await dataSource.query('UPDATE data_storage SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        storage.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toEqual([
        { kind: 'field', text: 'sa@project.iam.gserviceaccount.com' },
      ]);
    });

    it('emits OAuth identity email into atomicTokenSlots when clientEmail absent', async () => {
      await seedStorage({ title: 'OAuth Storage', type: DataStorageType.GOOGLE_BIGQUERY });

      const cred = dataSource.getRepository(DataStorageCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'google-oauth' as never;
      cred.credentials = {} as never;
      cred.identity = { email: 'user@example.com' };
      const savedCred = await dataSource.getRepository(DataStorageCredential).save(cred);

      const storage = (await storageRepo.findOne({ where: { projectId: 'proj-1' } }))!;
      await dataSource.query('UPDATE data_storage SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        storage.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toEqual([{ kind: 'field', text: 'user@example.com' }]);
    });

    it('emits no email for non-Google storage types', async () => {
      await seedStorage({ title: 'Snowflake Storage', type: DataStorageType.SNOWFLAKE });

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.atomicTokenSlots).toEqual([]);
    });

    it('embeddingText excludes linked context name and description', async () => {
      const storage = await seedStorage({ title: 'Analytics BigQuery' });

      const ctx = contextRepo.create();
      ctx.name = 'Finance Team';
      ctx.description = 'Finance domain data';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);

      await dataSource.query(
        'INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)',
        [storage.id, savedCtx.id]
      );

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      const expected = [
        'Analytics BigQuery',
        toHumanReadable(DataStorageType.GOOGLE_BIGQUERY),
      ].join('\n');
      expect(descriptor.embeddingText).toBe(expected);
    });

    it('embeddingText includes email for Google storage types', async () => {
      await seedStorage({ title: 'SA Storage', type: DataStorageType.GOOGLE_BIGQUERY });

      const cred = dataSource.getRepository(DataStorageCredential).create();
      cred.projectId = 'proj-1';
      cred.type = 'google-service-account' as never;
      cred.credentials = {} as never;
      cred.identity = { clientEmail: 'sa@proj.iam.gserviceaccount.com' };
      const savedCred = await dataSource.getRepository(DataStorageCredential).save(cred);

      const storage = (await storageRepo.findOne({ where: { projectId: 'proj-1' } }))!;
      await dataSource.query('UPDATE data_storage SET credentialId = ? WHERE id = ?', [
        savedCred.id,
        storage.id,
      ]);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      expect(descriptor.embeddingText).toContain('sa@proj.iam.gserviceaccount.com');
    });

    it('embeddingText excludes context with name but no description', async () => {
      const storage = await seedStorage({ title: 'Partial Context Storage' });

      const ctx = contextRepo.create();
      ctx.name = 'Ops Team';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);

      await dataSource.query(
        'INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)',
        [storage.id, savedCtx.id]
      );

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      expect(descriptor.embeddingText).not.toContain('Ops Team');
    });

    it('omits deleted storages', async () => {
      const storage = await seedStorage({ title: 'Active' });
      const toDelete = await seedStorage({ title: 'Deleted' });
      await storageRepo.softDelete(toDelete.id);

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors).toHaveLength(1);
      expect(page.descriptors[0].entityId).toBe(storage.id);
    });

    it('filters by projectId when provided', async () => {
      const inProject = await seedStorage({ title: 'In Project' }, 'proj-1');
      await seedStorage({ title: 'Other Project' }, 'proj-2');

      const page = await source.listSearchablePage('proj-1', null, 100);
      expect(page.descriptors).toHaveLength(1);
      expect(page.descriptors[0].entityId).toBe(inProject.id);
    });
  });

  describe('listSearchablePage', () => {
    it('returns descriptors for a page of storages', async () => {
      await seedStorage({ title: 'S1' });
      await seedStorage({ title: 'S2' });

      const page = await source.listSearchablePage('proj-1', null, 10);
      expect(page.descriptors).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('paginates using cursor', async () => {
      for (let i = 0; i < 5; i++) {
        await seedStorage({ title: `Storage ${i}` });
      }

      const collected: string[] = [];
      let cursor: PageCursor | null = null;
      do {
        const page = await source.listSearchablePage('proj-1', cursor, 2);
        for (const d of page.descriptors) collected.push(d.entityId);
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(collected).toHaveLength(5);
      expect(new Set(collected).size).toBe(5);
    });

    it('excludes soft-deleted storages', async () => {
      const live = await seedStorage({ title: 'Live' });
      const dead = await seedStorage({ title: 'Dead' });
      await storageRepo.softDelete(dead.id);

      const page = await source.listSearchablePage('proj-1', null, 10);
      const ids = page.descriptors.map(d => d.entityId);
      expect(ids).toContain(live.id);
      expect(ids).not.toContain(dead.id);
    });

    it('handles same-second createdAt tie-breaker by id', async () => {
      const now = new Date('2024-06-01T12:00:00.000Z');
      const s1 = await seedStorage({ title: 'First' });
      const s2 = await seedStorage({ title: 'Second' });
      await dataSource.query('UPDATE data_storage SET createdAt = ? WHERE id IN (?, ?)', [
        toCursorTimestamp(now),
        s1.id,
        s2.id,
      ]);

      const first = await source.listSearchablePage('proj-1', null, 1);
      expect(first.descriptors).toHaveLength(1);
      expect(first.nextCursor).not.toBeNull();

      const second = await source.listSearchablePage('proj-1', first.nextCursor, 1);
      const allIds = [first.descriptors[0].entityId, second.descriptors[0].entityId];
      expect(new Set(allIds)).toEqual(new Set([s1.id, s2.id]));
    });

    it('loads the keyset page before joining credential data', async () => {
      await seedStorage({ title: 'S1' });
      await seedStorage({ title: 'S2' });

      const findSpy = jest.spyOn(storageRepo, 'find');

      try {
        await source.listSearchablePage('proj-1', null, 1);

        expect(findSpy).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            select: { id: true, createdAt: true },
            loadEagerRelations: false,
            order: { createdAt: 'ASC', id: 'ASC' },
            take: 1,
          })
        );
        expect(findSpy.mock.calls[0][0]).not.toHaveProperty('relations');
        expect(findSpy).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            relations: { credential: true },
            loadEagerRelations: false,
          })
        );
        expect(findSpy.mock.calls[1][0]).not.toHaveProperty('take');
        expect(findSpy.mock.calls[1][0]).not.toHaveProperty('order');
      } finally {
        findSpy.mockRestore();
      }
    });
  });

  describe('listProjectIds', () => {
    it('returns distinct project ids with non-deleted storages', async () => {
      await seedStorage({ title: 'A' }, 'proj-1');
      await seedStorage({ title: 'B' }, 'proj-2');
      await seedStorage({ title: 'C' }, 'proj-1');

      const ids = await source.listProjectIds();
      expect(ids.sort()).toEqual(['proj-1', 'proj-2']);
    });

    it('excludes soft-deleted storages', async () => {
      const deleted = await seedStorage({ title: 'Dead' }, 'proj-deleted');
      await storageRepo.softDelete(deleted.id);

      const ids = await source.listProjectIds();
      expect(ids).not.toContain('proj-deleted');
    });
  });

  describe('source metadata', () => {
    it('exposes the DATA_STORAGE entity type', () => {
      expect(source.entityType).toBe(SearchableEntityType.DATA_STORAGE);
    });
  });

  describeLoadSearchableOneContract(
    () => source,
    async () => {
      const live = await seedStorage({ title: 'Contract Live' });
      const deleted = await seedStorage({ title: 'Contract Deleted' });
      await storageRepo.softDelete(deleted.id);
      return { liveId: live.id, deletedId: deleted.id };
    },
    SearchableEntityType.DATA_STORAGE
  );

  describe('access predicate parity', () => {
    it('returns only non-deleted rows without accessScope', async () => {
      const active = await seedStorage({ title: 'Active' });
      const deleted = await seedStorage({ title: 'Deleted' });
      await storageRepo.softDelete(deleted.id);

      await seedIndexRow(active.id);
      await seedIndexRow(deleted.id);

      const visible = await visibleIds('proj-1');
      expect(visible).toEqual(new Set([active.id]));
    });

    it('viewer sees only owned storages, not shared ones', async () => {
      const owned = await seedStorage({
        title: 'Owned',
        availableForUse: false,
        availableForMaintenance: false,
      });
      const shared = await seedStorage({
        title: 'Shared',
        availableForUse: true,
        availableForMaintenance: false,
      });

      await dataSource.query('INSERT INTO storage_owners (storage_id, user_id) VALUES (?, ?)', [
        owned.id,
        'viewer-1',
      ]);

      await seedIndexRow(owned.id);
      await seedIndexRow(shared.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'viewer-1', roles: ['viewer'] });
      expect(visible).toEqual(new Set([owned.id]));
    });

    it('viewer does not see non-owned shared storage', async () => {
      const shared = await seedStorage({
        title: 'Shared But Not Owned',
        availableForUse: true,
        availableForMaintenance: false,
      });

      await seedIndexRow(shared.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'outsider', roles: ['viewer'] });
      expect(visible.size).toBe(0);
    });

    it('editor sees shared storage (availableForUse)', async () => {
      const shared = await seedStorage({
        title: 'Shared For Use',
        availableForUse: true,
        availableForMaintenance: false,
      });

      await seedIndexRow(shared.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'editor-1', roles: ['editor'] });
      expect(visible).toEqual(new Set([shared.id]));
    });

    it('editor sees shared storage (availableForMaintenance)', async () => {
      const maint = await seedStorage({
        title: 'Maintenance Shared',
        availableForUse: false,
        availableForMaintenance: true,
      });

      await seedIndexRow(maint.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'editor-1', roles: ['editor'] });
      expect(visible).toEqual(new Set([maint.id]));
    });

    it('editor does not see private storage they do not own', async () => {
      const priv = await seedStorage({
        title: 'Private',
        availableForUse: false,
        availableForMaintenance: false,
      });

      await seedIndexRow(priv.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'editor-1', roles: ['editor'] });
      expect(visible.size).toBe(0);
    });

    it('editor sees storage they own regardless of sharing flags', async () => {
      const owned = await seedStorage({
        title: 'Private But Owned By Editor',
        availableForUse: false,
        availableForMaintenance: false,
      });

      await dataSource.query('INSERT INTO storage_owners (storage_id, user_id) VALUES (?, ?)', [
        owned.id,
        'editor-1',
      ]);

      await seedIndexRow(owned.id);

      getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
      const visible = await visibleIds('proj-1', { userId: 'editor-1', roles: ['editor'] });
      expect(visible).toEqual(new Set([owned.id]));
    });

    it('admin sees all storages and bypasses roleScope resolution', async () => {
      const priv = await seedStorage({
        title: 'Private',
        availableForUse: false,
        availableForMaintenance: false,
      });

      await seedIndexRow(priv.id);

      const visible = await visibleIds('proj-1', {
        userId: 'admin-user',
        roles: ['admin'],
      });
      expect(visible).toEqual(new Set([priv.id]));
      expect(getRoleScope).not.toHaveBeenCalled();
    });

    describe('SELECTED_CONTEXTS role scope for editors', () => {
      beforeEach(() => {
        getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
      });

      it('shows shared storage to editor with overlapping context', async () => {
        const storage = await seedStorage({
          title: 'Context Gated',
          availableForUse: true,
          availableForMaintenance: false,
        });

        const ctx = contextRepo.create();
        ctx.name = 'Finance';
        ctx.projectId = 'proj-1';
        const savedCtx = await contextRepo.save(ctx);

        await dataSource.query(
          'INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)',
          [storage.id, savedCtx.id]
        );
        await dataSource.query(
          'INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)',
          ['editor-ctx', 'proj-1', savedCtx.id]
        );

        await seedIndexRow(storage.id);

        const visible = await visibleIds('proj-1', {
          userId: 'editor-ctx',
          roles: ['editor'],
        });
        expect(visible).toEqual(new Set([storage.id]));
      });

      it('hides shared storage from editor without overlapping context', async () => {
        const storage = await seedStorage({
          title: 'Context Gated No Overlap',
          availableForUse: true,
          availableForMaintenance: false,
        });

        const ctx = contextRepo.create();
        ctx.name = 'Finance';
        ctx.projectId = 'proj-1';
        const savedCtx = await contextRepo.save(ctx);

        await dataSource.query(
          'INSERT INTO storage_contexts (storage_id, context_id) VALUES (?, ?)',
          [storage.id, savedCtx.id]
        );

        await seedIndexRow(storage.id);

        const visible = await visibleIds('proj-1', {
          userId: 'editor-ctx',
          roles: ['editor'],
        });
        expect(visible.size).toBe(0);
      });
    });
  });
});
