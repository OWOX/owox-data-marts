import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmDataMartCatalogAdapter } from './typeorm-data-mart-catalog.adapter';
import { DataMart } from '../../../data-marts/entities/data-mart.entity';
import { Context } from '../../../data-marts/entities/context.entity';
import { DataMartContext } from '../../../data-marts/entities/data-mart-context.entity';
import { DataMartRelationship } from '../../../data-marts/entities/data-mart-relationship.entity';
import { DataStorage } from '../../../data-marts/entities/data-storage.entity';
import { DataStorageCredential } from '../../../data-marts/entities/data-storage-credential.entity';
import { DataMartBusinessOwner } from '../../../data-marts/entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../../../data-marts/entities/data-mart-technical-owner.entity';
import { ConnectorState } from '../../../data-marts/entities/connector-state.entity';
import { StorageOwner } from '../../../data-marts/entities/storage-owner.entity';
import { StorageContext } from '../../../data-marts/entities/storage-context.entity';
import { MemberRoleContext } from '../../../data-marts/entities/member-role-context.entity';
import { DataMartStatus } from '../../../data-marts/enums/data-mart-status.enum';
import { DataStorageType } from '../../../data-marts/data-storage-types/enums/data-storage-type.enum';
import { RoleScope } from '../../../data-marts/enums/role-scope.enum';
import { ContextAccessService } from '../../../data-marts/services/context/context-access.service';

const TEST_ENTITIES = [
  DataMart,
  DataStorage,
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

describe('TypeOrmDataMartCatalogAdapter', () => {
  let module: TestingModule;
  let adapter: TypeOrmDataMartCatalogAdapter;
  let storageRepo: Repository<DataStorage>;
  let martRepo: Repository<DataMart>;
  let contextRepo: Repository<Context>;
  let dmcRepo: Repository<DataMartContext>;
  let relRepo: Repository<DataMartRelationship>;
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
        TypeOrmModule.forFeature([
          DataMart,
          DataStorage,
          Context,
          DataMartContext,
          DataMartRelationship,
        ]),
      ],
      providers: [
        TypeOrmDataMartCatalogAdapter,
        { provide: ContextAccessService, useValue: { getRoleScope } },
      ],
    }).compile();

    adapter = module.get(TypeOrmDataMartCatalogAdapter);
    storageRepo = module.get(getRepositoryToken(DataStorage));
    martRepo = module.get(getRepositoryToken(DataMart));
    contextRepo = module.get(getRepositoryToken(Context));
    dmcRepo = module.get(getRepositoryToken(DataMartContext));
    relRepo = module.get(getRepositoryToken(DataMartRelationship));
  }, 30_000);

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await relRepo.query('DELETE FROM data_mart_relationship');
    await relRepo.query('DELETE FROM member_role_contexts');
    await relRepo.query('DELETE FROM data_mart_technical_owners');
    await relRepo.query('DELETE FROM data_mart_business_owners');
    await dmcRepo.query('DELETE FROM data_mart_contexts');
    await contextRepo.query('DELETE FROM context');
    await martRepo.query('DELETE FROM data_mart');
    await storageRepo.query('DELETE FROM data_storage');
  });

  beforeEach(() => {
    getRoleScope.mockReset();
    getRoleScope.mockResolvedValue(RoleScope.ENTIRE_PROJECT);
  });

  async function seedStorage(projectId = 'proj-1'): Promise<DataStorage> {
    const storage = storageRepo.create();
    storage.type = DataStorageType.GOOGLE_BIGQUERY;
    storage.projectId = projectId;
    storage.createdById = 'user-1';
    return storageRepo.save(storage);
  }

  async function seedMart(
    storage: DataStorage,
    overrides: Partial<DataMart> = {}
  ): Promise<DataMart> {
    const mart = martRepo.create();
    mart.title = 'Test Mart';
    mart.projectId = 'proj-1';
    mart.status = DataMartStatus.DRAFT;
    mart.createdById = 'user-1';
    mart.storage = storage;
    Object.assign(mart, overrides);
    return martRepo.save(mart);
  }

  describe('listSearchable', () => {
    it('returns only PUBLISHED marts', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'Draft Mart', status: DataMartStatus.DRAFT });
      await seedMart(storage, { title: 'Published Mart', status: DataMartStatus.PUBLISHED });

      const result = await adapter.listSearchable();
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Published Mart');
    });

    it('excludes soft-deleted marts', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });
      await martRepo.softDelete(mart.id);

      const result = await adapter.listSearchable();
      expect(result).toHaveLength(0);
    });

    it('filters by projectId when provided', async () => {
      const storageA = await seedStorage('proj-a');
      const storageB = await seedStorage('proj-b');

      await seedMart(storageA, {
        title: 'Mart A',
        projectId: 'proj-a',
        status: DataMartStatus.PUBLISHED,
      });
      await seedMart(storageB, {
        title: 'Mart B',
        projectId: 'proj-b',
        status: DataMartStatus.PUBLISHED,
      });

      const resultA = await adapter.listSearchable('proj-a');
      expect(resultA).toHaveLength(1);
      expect(resultA[0].title).toBe('Mart A');

      const resultAll = await adapter.listSearchable();
      expect(resultAll).toHaveLength(2);
    });

    it('extracts fieldNames using alias over name', async () => {
      const storage = await seedStorage();
      await seedMart(storage, {
        status: DataMartStatus.PUBLISHED,
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'raw_name',
              alias: 'friendly_name',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
            {
              name: 'no_alias',
              type: 'INTEGER' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
          ],
        },
      });

      const result = await adapter.listSearchable();
      expect(result[0].fieldNames).toEqual(['friendly_name', 'no_alias']);
    });

    it('skips DISCONNECTED fields', async () => {
      const storage = await seedStorage();
      await seedMart(storage, {
        status: DataMartStatus.PUBLISHED,
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'connected_field',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
            {
              name: 'disconnected_field',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'DISCONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
          ],
        },
      });

      const result = await adapter.listSearchable();
      expect(result[0].fieldNames).toEqual(['connected_field']);
    });

    it('skips isHiddenForReporting fields', async () => {
      const storage = await seedStorage();
      await seedMart(storage, {
        status: DataMartStatus.PUBLISHED,
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'visible_field',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
            {
              name: 'hidden_field',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: true,
              isPrimaryKey: false,
            },
          ],
        },
      });

      const result = await adapter.listSearchable();
      expect(result[0].fieldNames).toEqual(['visible_field']);
    });

    it('recurses into nested fields and skips nested DISCONNECTED', async () => {
      const storage = await seedStorage();
      await seedMart(storage, {
        status: DataMartStatus.PUBLISHED,
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'parent',
              alias: 'parent_alias',
              type: 'RECORD' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
              fields: [
                {
                  name: 'child',
                  alias: 'child_alias',
                  type: 'STRING' as never,
                  mode: 'NULLABLE' as never,
                  status: 'CONNECTED' as never,
                  isHiddenForReporting: false,
                  isPrimaryKey: false,
                },
                {
                  name: 'dead_child',
                  type: 'STRING' as never,
                  mode: 'NULLABLE' as never,
                  status: 'DISCONNECTED' as never,
                  isHiddenForReporting: false,
                  isPrimaryKey: false,
                },
              ],
            },
          ],
        },
      });

      const result = await adapter.listSearchable();
      expect(result[0].fieldNames).toEqual(['parent_alias', 'child_alias']);
    });

    it('maps contexts with name and description as content', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });

      const ctx = contextRepo.create();
      ctx.name = 'Business Context';
      ctx.description = 'Describes business rules';
      ctx.projectId = 'proj-1';
      await contextRepo.save(ctx);

      const join = dmcRepo.create();
      join.dataMartId = mart.id;
      join.contextId = ctx.id;
      await dmcRepo.save(join);

      const result = await adapter.listSearchable();
      expect(result[0].contexts).toEqual([
        { name: 'Business Context', content: 'Describes business rules' },
      ]);
    });

    it('keeps context with empty content when name is present', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });

      const ctx = contextRepo.create();
      ctx.name = 'Named Context';
      ctx.projectId = 'proj-1';
      await contextRepo.save(ctx);

      const join = dmcRepo.create();
      join.dataMartId = mart.id;
      join.contextId = ctx.id;
      await dmcRepo.save(join);

      const result = await adapter.listSearchable();
      expect(result[0].contexts).toHaveLength(1);
      expect(result[0].contexts[0]).toEqual({ name: 'Named Context', content: '' });
    });

    it('returns empty contexts when mart has none', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { status: DataMartStatus.PUBLISHED });

      const result = await adapter.listSearchable();
      expect(result[0].contexts).toEqual([]);
    });

    it('maps modifiedAt from entity', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { status: DataMartStatus.PUBLISHED });

      const result = await adapter.listSearchable();
      expect(result[0].modifiedAt).toBeInstanceOf(Date);
    });

    describe('accessScope filtering', () => {
      it('excludes non-shared, non-owned marts for a non-admin viewer', async () => {
        const storage = await seedStorage();
        await seedMart(storage, {
          title: 'Private',
          status: DataMartStatus.PUBLISHED,
          availableForReporting: false,
          availableForMaintenance: false,
        });

        const result = await adapter.listSearchable('proj-1', {
          userId: 'outsider',
          roles: ['viewer'],
        });
        expect(result).toHaveLength(0);
      });

      it('includes shared-for-reporting marts for a non-admin viewer', async () => {
        const storage = await seedStorage();
        await seedMart(storage, {
          title: 'Shared',
          status: DataMartStatus.PUBLISHED,
          availableForReporting: true,
        });

        const result = await adapter.listSearchable('proj-1', {
          userId: 'outsider',
          roles: ['viewer'],
        });
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Shared');
      });

      it('admin sees non-shared marts and bypasses roleScope resolution', async () => {
        const storage = await seedStorage();
        await seedMart(storage, {
          title: 'Private',
          status: DataMartStatus.PUBLISHED,
          availableForReporting: false,
        });

        const result = await adapter.listSearchable('proj-1', {
          userId: 'admin-user',
          roles: ['admin'],
        });
        expect(result).toHaveLength(1);
        expect(getRoleScope).not.toHaveBeenCalled();
      });

      it('does not apply visibility filter when accessScope is absent', async () => {
        const storage = await seedStorage();
        await seedMart(storage, {
          title: 'Private',
          status: DataMartStatus.PUBLISHED,
          availableForReporting: false,
        });

        const result = await adapter.listSearchable('proj-1');
        expect(result).toHaveLength(1);
        expect(getRoleScope).not.toHaveBeenCalled();
      });

      it('includes a non-shared mart the user technically owns', async () => {
        const storage = await seedStorage();
        const mart = await seedMart(storage, {
          title: 'Owned',
          status: DataMartStatus.PUBLISHED,
          availableForReporting: false,
          availableForMaintenance: false,
        });
        await martRepo.query(
          'INSERT INTO data_mart_technical_owners (data_mart_id, user_id) VALUES (?, ?)',
          [mart.id, 'owner-x']
        );

        const result = await adapter.listSearchable('proj-1', {
          userId: 'owner-x',
          roles: ['viewer'],
        });
        expect(result).toHaveLength(1);
        expect(result[0].title).toBe('Owned');
      });

      it('hides maintenance-shared marts from a viewer but shows them to an editor', async () => {
        const storage = await seedStorage();
        await seedMart(storage, {
          title: 'Maintenance',
          status: DataMartStatus.PUBLISHED,
          availableForReporting: false,
          availableForMaintenance: true,
        });

        const asViewer = await adapter.listSearchable('proj-1', {
          userId: 'outsider',
          roles: ['viewer'],
        });
        expect(asViewer).toHaveLength(0);

        const asEditor = await adapter.listSearchable('proj-1', {
          userId: 'outsider',
          roles: ['editor'],
        });
        expect(asEditor).toHaveLength(1);
        expect(asEditor[0].title).toBe('Maintenance');
      });

      describe('SELECTED_CONTEXTS role scope', () => {
        async function seedSharedMartWithContext(): Promise<string> {
          const storage = await seedStorage();
          const mart = await seedMart(storage, {
            title: 'ContextGated',
            status: DataMartStatus.PUBLISHED,
            availableForReporting: true,
          });
          const ctx = contextRepo.create();
          ctx.name = 'Finance';
          ctx.projectId = 'proj-1';
          const savedCtx = await contextRepo.save(ctx);
          const join = dmcRepo.create();
          join.dataMartId = mart.id;
          join.contextId = savedCtx.id;
          await dmcRepo.save(join);
          return savedCtx.id;
        }

        beforeEach(() => {
          getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
        });

        it('shows a shared mart only when the user has an overlapping context', async () => {
          const contextId = await seedSharedMartWithContext();
          await martRepo.query(
            'INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)',
            ['scoped-user', 'proj-1', contextId]
          );

          const result = await adapter.listSearchable('proj-1', {
            userId: 'scoped-user',
            roles: ['viewer'],
          });
          expect(result).toHaveLength(1);
        });

        it('hides a shared mart when the user has no overlapping context', async () => {
          await seedSharedMartWithContext();

          const result = await adapter.listSearchable('proj-1', {
            userId: 'scoped-user',
            roles: ['viewer'],
          });
          expect(result).toHaveLength(0);
        });
      });
    });
  });

  describe('listRelationships', () => {
    it('returns edges for the given project', async () => {
      const storage = await seedStorage();
      const source = await seedMart(storage, { title: 'Source', status: DataMartStatus.PUBLISHED });
      const target = await seedMart(storage, { title: 'Target', status: DataMartStatus.PUBLISHED });

      const rel = relRepo.create();
      rel.projectId = 'proj-1';
      rel.createdById = 'user-1';
      rel.targetAlias = 'alias';
      rel.sourceDataMart = source;
      rel.targetDataMart = target;
      rel.dataStorage = storage;
      rel.joinConditions = [];
      await relRepo.save(rel);

      const result = await adapter.listRelationships('proj-1');
      expect(result).toHaveLength(1);
      expect(result[0].sourceDataMartId).toBe(source.id);
      expect(result[0].targetDataMartId).toBe(target.id);
    });

    it('returns empty array for unknown project', async () => {
      const result = await adapter.listRelationships('unknown-proj');
      expect(result).toEqual([]);
    });
  });

  describe('listLiveIds', () => {
    it('returns ids of PUBLISHED non-deleted marts', async () => {
      const storage = await seedStorage();
      const published = await seedMart(storage, { status: DataMartStatus.PUBLISHED });
      const draft = await seedMart(storage, { title: 'Draft', status: DataMartStatus.DRAFT });

      const ids = await adapter.listLiveIds();
      expect(ids.has(published.id)).toBe(true);
      expect(ids.has(draft.id)).toBe(false);
    });

    it('excludes soft-deleted marts', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });
      await martRepo.softDelete(mart.id);

      const ids = await adapter.listLiveIds();
      expect(ids.has(mart.id)).toBe(false);
    });

    it('matches listSearchable ids exactly', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'P', status: DataMartStatus.PUBLISHED });
      await seedMart(storage, { title: 'D', status: DataMartStatus.DRAFT });

      const searchable = await adapter.listSearchable('proj-1');
      const liveIds = await adapter.listLiveIds('proj-1');

      expect(liveIds).toEqual(new Set(searchable.map(m => m.id)));
    });

    it('filters by projectId when provided', async () => {
      const storageA = await seedStorage('proj-a');
      const storageB = await seedStorage('proj-b');

      const martA = await seedMart(storageA, {
        title: 'A',
        projectId: 'proj-a',
        status: DataMartStatus.PUBLISHED,
      });
      const martB = await seedMart(storageB, {
        title: 'B',
        projectId: 'proj-b',
        status: DataMartStatus.PUBLISHED,
      });

      const idsA = await adapter.listLiveIds('proj-a');
      expect(idsA.has(martA.id)).toBe(true);
      expect(idsA.has(martB.id)).toBe(false);
    });
  });
});
