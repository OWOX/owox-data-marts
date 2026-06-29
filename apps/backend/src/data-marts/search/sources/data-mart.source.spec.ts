import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DataMartIndexableSource } from './data-mart.source';
import { TypeOrmDataMartCatalogAdapter } from '../catalog/typeorm-data-mart-catalog.adapter';
import { DATA_MART_CATALOG } from '../catalog/data-mart-catalog.port';
import { SearchIndexRepository } from '../schema/search-index.repository';
import { DataMart } from '../../entities/data-mart.entity';
import { DataMartSearchIndex } from '../../entities/search/data-mart-search-index.entity';
import { Context } from '../../entities/context.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { DataMartBusinessOwner } from '../../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../../entities/data-mart-technical-owner.entity';
import { ConnectorState } from '../../entities/connector-state.entity';
import { StorageOwner } from '../../entities/storage-owner.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { RoleScope } from '../../enums/role-scope.enum';
import { ContextAccessService } from '../../services/context/context-access.service';
import { SearchableEntityType } from '../../../common/search/search.facade';
import { DATA_MART_SCORING_CONFIG } from '../engine/scoring-config';
import type { SourceAccessScope } from './indexable-source.port';
import { describeLoadSearchableOneContract } from './indexable-source.contract';
import { embeddingText } from '../indexing/document-builder';

const TEST_ENTITIES = [
  DataMart,
  DataMartSearchIndex,
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

const STUB_EMBEDDING = Buffer.from(new Float32Array([1, 0]).buffer);

describe('DataMartIndexableSource', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let source: DataMartIndexableSource;
  let indexRepo: SearchIndexRepository;
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
        { provide: DATA_MART_CATALOG, useExisting: TypeOrmDataMartCatalogAdapter },
        DataMartIndexableSource,
        SearchIndexRepository,
        { provide: ContextAccessService, useValue: { getRoleScope } },
      ],
    }).compile();

    dataSource = module.get(getDataSourceToken());

    source = module.get(DataMartIndexableSource);
    indexRepo = module.get(SearchIndexRepository);
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
    await dataSource.query('DELETE FROM data_mart_search_index');
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

  async function seedIndexRow(entityId: string, projectId = 'proj-1'): Promise<void> {
    await indexRepo.upsert(SearchableEntityType.DATA_MART, {
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
      SearchableEntityType.DATA_MART,
      projectId,
      predicate,
      '',
      { candidateLimit: 1000 }
    );
    return new Set(page.rows.map(r => r.entityId));
  }

  describe('listSearchablePage projection', () => {
    it('projects title, description, and fields into typed slots without contexts', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, {
        title: 'Revenue Mart',
        description: 'Monthly revenue rollup',
        status: DataMartStatus.PUBLISHED,
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'amount',
              type: 'INTEGER' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
            {
              name: 'currency',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
          ],
        },
      });

      const ctx = contextRepo.create();
      ctx.name = 'Finance';
      ctx.description = 'Finance domain rules';
      ctx.projectId = 'proj-1';
      const savedCtx = await contextRepo.save(ctx);
      const join = dmcRepo.create();
      join.dataMartId = mart.id;
      join.contextId = savedCtx.id;
      await dmcRepo.save(join);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;

      expect(descriptor.entityType).toBe(SearchableEntityType.DATA_MART);
      expect(descriptor.entityId).toBe(mart.id);
      expect(descriptor.title).toBe('Revenue Mart');
      expect(descriptor.description).toBe('Monthly revenue rollup');
      expect(descriptor.richTextSlots).toEqual([
        { kind: 'title', text: 'Revenue Mart' },
        { kind: 'description', text: 'Monthly revenue rollup' },
      ]);
      expect(descriptor.atomicTokenSlots).toEqual([
        { kind: 'field', text: 'amount' },
        { kind: 'field', text: 'currency' },
      ]);
    });

    it('omits the description slot when the mart has no description', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'No Desc', status: DataMartStatus.PUBLISHED });

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      expect(descriptor.description).toBeNull();
      expect(descriptor.richTextSlots).toEqual([{ kind: 'title', text: 'No Desc' }]);
    });

    it('builds embeddingText from title, description, and output schema details only', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, {
        title: 'T',
        description: 'D',
        status: DataMartStatus.PUBLISHED,
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'f1',
              alias: 'Friendly Field',
              description: 'Field business meaning',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
          ],
        },
      });
      const ctxA = contextRepo.create();
      ctxA.name = 'CtxAName';
      ctxA.description = 'CtxAContent';
      ctxA.projectId = 'proj-1';
      const savedA = await contextRepo.save(ctxA);
      const ctxB = contextRepo.create();
      ctxB.name = 'CtxBName';
      ctxB.description = 'CtxBContent';
      ctxB.projectId = 'proj-1';
      const savedB = await contextRepo.save(ctxB);
      for (const c of [savedA, savedB]) {
        const join = dmcRepo.create();
        join.dataMartId = mart.id;
        join.contextId = c.id;
        await dmcRepo.save(join);
      }

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      expect(embeddingText(descriptor)).toBe(
        ['T', 'D', 'Output schema:', '- f1 / Friendly Field: Field business meaning'].join('\n')
      );
      expect(embeddingText(descriptor)).not.toContain('CtxAContent');
      expect(embeddingText(descriptor)).not.toContain('STRING');
    });

    it('computes fieldCount and extendability from own fields only when no outbound edges', async () => {
      const storage = await seedStorage();
      await seedMart(storage, {
        title: 'Solo',
        status: DataMartStatus.PUBLISHED,
        schema: {
          type: 'bigquery-data-mart-schema',
          fields: [
            {
              name: 'a',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
            {
              name: 'b',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
            {
              name: 'c',
              type: 'STRING' as never,
              mode: 'NULLABLE' as never,
              status: 'CONNECTED' as never,
              isHiddenForReporting: false,
              isPrimaryKey: false,
            },
          ],
        },
      });

      const page = await source.listSearchablePage('proj-1', null, 100);
      const [descriptor] = page.descriptors;
      expect(descriptor.fieldCount).toBe(3);
      expect(descriptor.extendability).toBe(Math.round(Math.log2(3 + 1) * 10));
    });

    it('includes outbound-edge target field counts in fieldCount (Phase-0 parity)', async () => {
      const storage = await seedStorage();
      const fieldSchema = (names: string[]) => ({
        type: 'bigquery-data-mart-schema' as const,
        fields: names.map(name => ({
          name,
          type: 'STRING' as never,
          mode: 'NULLABLE' as never,
          status: 'CONNECTED' as never,
          isHiddenForReporting: false,
          isPrimaryKey: false,
        })),
      });
      const sourceMart = await seedMart(storage, {
        title: 'Source',
        status: DataMartStatus.PUBLISHED,
        schema: fieldSchema(['s1', 's2']),
      });
      const targetMart = await seedMart(storage, {
        title: 'Target',
        status: DataMartStatus.PUBLISHED,
        schema: fieldSchema(['t1', 't2', 't3']),
      });

      const rel = relRepo.create();
      rel.projectId = 'proj-1';
      rel.createdById = 'user-1';
      rel.targetAlias = 'alias';
      rel.sourceDataMart = sourceMart;
      rel.targetDataMart = targetMart;
      rel.dataStorage = storage;
      rel.joinConditions = [];
      await relRepo.save(rel);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const src = page.descriptors.find(d => d.entityId === sourceMart.id)!;
      const tgt = page.descriptors.find(d => d.entityId === targetMart.id)!;

      expect(src.fieldCount).toBe(5);
      expect(src.extendability).toBe(Math.round(Math.log2(5 + 1) * 10));
      expect(tgt.fieldCount).toBe(3);
    });

    it('global reconcile path and loadSearchableOne agree on fieldCount incl. outbound targets', async () => {
      const storage = await seedStorage();
      const fieldSchema = (names: string[]) => ({
        type: 'bigquery-data-mart-schema' as const,
        fields: names.map(name => ({
          name,
          type: 'STRING' as never,
          mode: 'NULLABLE' as never,
          status: 'CONNECTED' as never,
          isHiddenForReporting: false,
          isPrimaryKey: false,
        })),
      });
      const sourceMart = await seedMart(storage, {
        title: 'Source',
        status: DataMartStatus.PUBLISHED,
        schema: fieldSchema(['s1', 's2']),
      });
      const targetMart = await seedMart(storage, {
        title: 'Target',
        status: DataMartStatus.PUBLISHED,
        schema: fieldSchema(['t1', 't2', 't3']),
      });
      const rel = relRepo.create();
      rel.projectId = 'proj-1';
      rel.createdById = 'user-1';
      rel.targetAlias = 'alias';
      rel.sourceDataMart = sourceMart;
      rel.targetDataMart = targetMart;
      rel.dataStorage = storage;
      rel.joinConditions = [];
      await relRepo.save(rel);

      const page = await source.listSearchablePage('proj-1', null, 100);
      const fromGlobalList = page.descriptors.find(d => d.entityId === sourceMart.id)!;
      const fromLoadOne = await source.loadSearchableOne(sourceMart.id);

      expect(fromGlobalList.fieldCount).toBe(5);
      expect(fromLoadOne?.fieldCount).toBe(5);
    });

    it('includes draft marts in listSearchablePage results', async () => {
      const storage = await seedStorage();
      const draft = await seedMart(storage, { title: 'Draft', status: DataMartStatus.DRAFT });
      const published = await seedMart(storage, {
        title: 'Published',
        status: DataMartStatus.PUBLISHED,
      });

      const page = await source.listSearchablePage('proj-1', null, 100);
      const ids = page.descriptors.map(d => d.entityId);
      expect(ids).toContain(draft.id);
      expect(ids).toContain(published.id);
    });

    it('sets isDraft correctly on descriptors', async () => {
      const storage = await seedStorage();
      const draft = await seedMart(storage, { title: 'Draft', status: DataMartStatus.DRAFT });
      const published = await seedMart(storage, {
        title: 'Published',
        status: DataMartStatus.PUBLISHED,
      });

      const page = await source.listSearchablePage('proj-1', null, 100);
      const draftDesc = page.descriptors.find(d => d.entityId === draft.id)!;
      const publishedDesc = page.descriptors.find(d => d.entityId === published.id)!;
      expect(draftDesc.isDraft).toBe(true);
      expect(publishedDesc.isDraft).toBe(false);
    });
  });

  describe('listSearchablePage', () => {
    it('returns descriptors for a page of marts', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'Mart A', status: DataMartStatus.PUBLISHED });
      await seedMart(storage, { title: 'Mart B', status: DataMartStatus.DRAFT });

      const page = await source.listSearchablePage('proj-1', null, 10);

      expect(page.descriptors).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('paginates using cursor', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'A', status: DataMartStatus.PUBLISHED });
      await seedMart(storage, { title: 'B', status: DataMartStatus.PUBLISHED });
      await seedMart(storage, { title: 'C', status: DataMartStatus.PUBLISHED });

      const page1 = await source.listSearchablePage('proj-1', null, 2);
      expect(page1.descriptors).toHaveLength(2);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await source.listSearchablePage('proj-1', page1.nextCursor, 2);
      expect(page2.descriptors).toHaveLength(1);
      expect(page2.nextCursor).toBeNull();

      const allIds = [...page1.descriptors, ...page2.descriptors].map(d => d.entityId);
      expect(new Set(allIds).size).toBe(3);
    });

    it('excludes soft-deleted marts', async () => {
      const storage = await seedStorage();
      const live = await seedMart(storage, { title: 'Live', status: DataMartStatus.PUBLISHED });
      const deleted = await seedMart(storage, {
        title: 'Deleted',
        status: DataMartStatus.PUBLISHED,
      });
      await martRepo.softDelete(deleted.id);

      const page = await source.listSearchablePage('proj-1', null, 10);
      const ids = page.descriptors.map(d => d.entityId);
      expect(ids).toContain(live.id);
      expect(ids).not.toContain(deleted.id);
    });
  });

  describe('listProjectIds', () => {
    it('returns distinct project ids with non-deleted marts', async () => {
      const storage = await seedStorage('proj-1');
      const storage2 = await seedStorage('proj-2');
      await seedMart(storage, { projectId: 'proj-1' });
      await seedMart(storage2, { projectId: 'proj-2' });

      const projectIds = await source.listProjectIds();
      expect(projectIds.sort()).toEqual(['proj-1', 'proj-2'].sort());
    });
  });

  describe('access predicate parity', () => {
    it('returns all non-deleted rows regardless of status without accessScope', async () => {
      const storage = await seedStorage();
      const published = await seedMart(storage, {
        title: 'Pub',
        status: DataMartStatus.PUBLISHED,
      });
      const draft = await seedMart(storage, { title: 'Draft', status: DataMartStatus.DRAFT });
      const deleted = await seedMart(storage, {
        title: 'Deleted',
        status: DataMartStatus.PUBLISHED,
      });
      await martRepo.softDelete(deleted.id);

      await seedIndexRow(published.id);
      await seedIndexRow(draft.id);
      await seedIndexRow(deleted.id);

      const visible = await visibleIds('proj-1');
      expect(visible).toEqual(new Set([published.id, draft.id]));
    });

    it('excludes non-shared marts for a non-admin viewer', async () => {
      const storage = await seedStorage();
      const priv = await seedMart(storage, {
        title: 'Private',
        status: DataMartStatus.PUBLISHED,
        availableForReporting: false,
        availableForMaintenance: false,
      });
      await seedIndexRow(priv.id);

      const visible = await visibleIds('proj-1', { userId: 'outsider', roles: ['viewer'] });
      expect(visible.size).toBe(0);
    });

    it('includes shared-for-reporting marts for a non-admin viewer', async () => {
      const storage = await seedStorage();
      const shared = await seedMart(storage, {
        title: 'Shared',
        status: DataMartStatus.PUBLISHED,
        availableForReporting: true,
      });
      await seedIndexRow(shared.id);

      const visible = await visibleIds('proj-1', { userId: 'outsider', roles: ['viewer'] });
      expect(visible).toEqual(new Set([shared.id]));
    });

    it('admin sees non-shared marts and bypasses roleScope resolution', async () => {
      const storage = await seedStorage();
      const priv = await seedMart(storage, {
        title: 'Private',
        status: DataMartStatus.PUBLISHED,
        availableForReporting: false,
      });
      await seedIndexRow(priv.id);

      const visible = await visibleIds('proj-1', { userId: 'admin-user', roles: ['admin'] });
      expect(visible).toEqual(new Set([priv.id]));
      expect(getRoleScope).not.toHaveBeenCalled();
    });

    it('includes a non-shared mart the user technically owns', async () => {
      const storage = await seedStorage();
      const owned = await seedMart(storage, {
        title: 'Owned',
        status: DataMartStatus.PUBLISHED,
        availableForReporting: false,
        availableForMaintenance: false,
      });
      await martRepo.query(
        'INSERT INTO data_mart_technical_owners (data_mart_id, user_id) VALUES (?, ?)',
        [owned.id, 'owner-x']
      );
      await seedIndexRow(owned.id);

      const visible = await visibleIds('proj-1', { userId: 'owner-x', roles: ['viewer'] });
      expect(visible).toEqual(new Set([owned.id]));
    });

    it('hides maintenance-shared marts from a viewer but shows them to an editor', async () => {
      const storage = await seedStorage();
      const maint = await seedMart(storage, {
        title: 'Maintenance',
        status: DataMartStatus.PUBLISHED,
        availableForReporting: false,
        availableForMaintenance: true,
      });
      await seedIndexRow(maint.id);

      const asViewer = await visibleIds('proj-1', { userId: 'outsider', roles: ['viewer'] });
      expect(asViewer.size).toBe(0);

      const asEditor = await visibleIds('proj-1', { userId: 'outsider', roles: ['editor'] });
      expect(asEditor).toEqual(new Set([maint.id]));
    });

    describe('SELECTED_CONTEXTS role scope', () => {
      async function seedSharedMartWithContext(): Promise<{ martId: string; contextId: string }> {
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
        await seedIndexRow(mart.id);
        return { martId: mart.id, contextId: savedCtx.id };
      }

      beforeEach(() => {
        getRoleScope.mockResolvedValue(RoleScope.SELECTED_CONTEXTS);
      });

      it('shows a shared mart only when the user has an overlapping context', async () => {
        const { martId, contextId } = await seedSharedMartWithContext();
        await martRepo.query(
          'INSERT INTO member_role_contexts (user_id, project_id, context_id) VALUES (?, ?, ?)',
          ['scoped-user', 'proj-1', contextId]
        );

        const visible = await visibleIds('proj-1', {
          userId: 'scoped-user',
          roles: ['viewer'],
        });
        expect(visible).toEqual(new Set([martId]));
      });

      it('hides a shared mart when the user has no overlapping context', async () => {
        await seedSharedMartWithContext();

        const visible = await visibleIds('proj-1', {
          userId: 'scoped-user',
          roles: ['viewer'],
        });
        expect(visible.size).toBe(0);
      });
    });
  });

  describe('source metadata', () => {
    it('exposes the DATA_MART entity type and scoring config', () => {
      expect(source.entityType).toBe(SearchableEntityType.DATA_MART);
      expect(source.scoringConfig).toBe(DATA_MART_SCORING_CONFIG);
    });
  });

  describeLoadSearchableOneContract(
    () => source,
    async () => {
      const storage = await seedStorage();
      const live = await seedMart(storage, {
        title: 'Contract Live',
        status: DataMartStatus.PUBLISHED,
      });
      const deleted = await seedMart(storage, {
        title: 'Contract Deleted',
        status: DataMartStatus.PUBLISHED,
      });
      await martRepo.softDelete(deleted.id);
      return { liveId: live.id, deletedId: deleted.id };
    },
    SearchableEntityType.DATA_MART
  );
});
