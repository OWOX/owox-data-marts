import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmDataMartCatalogAdapter } from './typeorm-data-mart-catalog.adapter';
import { DataMart } from '../../entities/data-mart.entity';
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

  it('adapter is defined', () => {
    expect(adapter).toBeDefined();
  });

  describe('listSearchablePage', () => {
    it('returns an empty page when no marts exist', async () => {
      const page = await adapter.listSearchablePage('proj-1', null, 10);
      expect(page.descriptors).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });

    it('returns descriptors for all non-deleted marts in the project', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'Mart A', status: DataMartStatus.PUBLISHED });
      await seedMart(storage, { title: 'Mart B', status: DataMartStatus.DRAFT });

      const page = await adapter.listSearchablePage('proj-1', null, 10);
      expect(page.descriptors).toHaveLength(2);
      const titles = page.descriptors.map(d => d.title).sort();
      expect(titles).toEqual(['Mart A', 'Mart B']);
    });

    it('sets isDraft from status', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'Draft', status: DataMartStatus.DRAFT });
      await seedMart(storage, { title: 'Published', status: DataMartStatus.PUBLISHED });

      const page = await adapter.listSearchablePage('proj-1', null, 10);
      const draft = page.descriptors.find(d => d.title === 'Draft')!;
      const published = page.descriptors.find(d => d.title === 'Published')!;
      expect(draft.isDraft).toBe(true);
      expect(published.isDraft).toBe(false);
    });

    it('excludes soft-deleted marts', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });
      await martRepo.softDelete(mart.id);

      const page = await adapter.listSearchablePage('proj-1', null, 10);
      expect(page.descriptors).toHaveLength(0);
    });

    it('respects the limit and returns a nextCursor when more rows exist', async () => {
      const storage = await seedStorage();
      await seedMart(storage, { title: 'A', status: DataMartStatus.PUBLISHED });
      await seedMart(storage, { title: 'B', status: DataMartStatus.PUBLISHED });
      await seedMart(storage, { title: 'C', status: DataMartStatus.PUBLISHED });

      const page = await adapter.listSearchablePage('proj-1', null, 2);
      expect(page.descriptors).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });
  });

  describe('loadSearchable', () => {
    it('returns null for a non-existent entity', async () => {
      const result = await adapter.loadSearchable('non-existent-id');
      expect(result).toBeNull();
    });

    it('returns the searchable mart for an existing id', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, {
        title: 'My Mart',
        status: DataMartStatus.PUBLISHED,
      });

      const result = await adapter.loadSearchable(mart.id);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('My Mart');
      expect(result!.projectId).toBe('proj-1');
    });

    it('returns null for a soft-deleted mart', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });
      await martRepo.softDelete(mart.id);

      const result = await adapter.loadSearchable(mart.id);
      expect(result).toBeNull();
    });
  });

  describe('listOutboundEdges', () => {
    it('returns empty array when no relationships exist', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });

      const edges = await adapter.listOutboundEdges(mart.id);
      expect(edges).toEqual([]);
    });

    it('returns outbound edges for a source mart', async () => {
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

      const edges = await adapter.listOutboundEdges(source.id);
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceDataMartId).toBe(source.id);
      expect(edges[0].targetDataMartId).toBe(target.id);
    });
  });

  describe('listOutboundEdgesFor', () => {
    it('returns empty array for empty source ids', async () => {
      const edges = await adapter.listOutboundEdgesFor([]);
      expect(edges).toEqual([]);
    });

    it('returns all edges for the given source ids', async () => {
      const storage = await seedStorage();
      const s1 = await seedMart(storage, { title: 'S1', status: DataMartStatus.PUBLISHED });
      const s2 = await seedMart(storage, { title: 'S2', status: DataMartStatus.PUBLISHED });
      const target = await seedMart(storage, { title: 'T', status: DataMartStatus.PUBLISHED });

      for (const source of [s1, s2]) {
        const rel = relRepo.create();
        rel.projectId = 'proj-1';
        rel.createdById = 'user-1';
        rel.targetAlias = 'alias';
        rel.sourceDataMart = source;
        rel.targetDataMart = target;
        rel.dataStorage = storage;
        rel.joinConditions = [];
        await relRepo.save(rel);
      }

      const edges = await adapter.listOutboundEdgesFor([s1.id, s2.id]);
      expect(edges).toHaveLength(2);
    });
  });

  describe('listProjectIds', () => {
    it('returns empty array when no marts exist', async () => {
      const ids = await adapter.listProjectIds();
      expect(ids).toEqual([]);
    });

    it('returns distinct project ids across marts', async () => {
      const s1 = await seedStorage('proj-a');
      const s2 = await seedStorage('proj-b');
      await seedMart(s1, { projectId: 'proj-a', status: DataMartStatus.PUBLISHED });
      await seedMart(s1, { projectId: 'proj-a', status: DataMartStatus.DRAFT });
      await seedMart(s2, { projectId: 'proj-b', status: DataMartStatus.PUBLISHED });

      const ids = await adapter.listProjectIds();
      expect(ids.sort()).toEqual(['proj-a', 'proj-b']);
    });

    it('excludes soft-deleted marts from project id list', async () => {
      const storage = await seedStorage('proj-deleted');
      const mart = await seedMart(storage, {
        projectId: 'proj-deleted',
        status: DataMartStatus.PUBLISHED,
      });
      await martRepo.softDelete(mart.id);

      const ids = await adapter.listProjectIds();
      expect(ids).not.toContain('proj-deleted');
    });
  });
});
