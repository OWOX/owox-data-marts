import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SearchIndexRepository, SearchIndexRow } from './search-index.repository';
import { DataMart } from '../../entities/data-mart.entity';
import { DataStorage } from '../../entities/data-storage.entity';
import { DataStorageCredential } from '../../entities/data-storage-credential.entity';
import { DataMartContext } from '../../entities/data-mart-context.entity';
import { DataMartBusinessOwner } from '../../entities/data-mart-business-owner.entity';
import { DataMartTechnicalOwner } from '../../entities/data-mart-technical-owner.entity';
import { DataMartRelationship } from '../../entities/data-mart-relationship.entity';
import { ConnectorState } from '../../entities/connector-state.entity';
import { Context } from '../../entities/context.entity';
import { StorageOwner } from '../../entities/storage-owner.entity';
import { StorageContext } from '../../entities/storage-context.entity';
import { MemberRoleContext } from '../../entities/member-role-context.entity';
import { DataMartSearchIndex } from '../../entities/search/data-mart-search-index.entity';
import { DataStorageSearchIndex } from '../../entities/search/data-storage-search-index.entity';
import { DataDestinationSearchIndex } from '../../entities/search/data-destination-search-index.entity';
import { DataMartStatus } from '../../enums/data-mart-status.enum';
import { DataStorageType } from '../../data-storage-types/enums/data-storage-type.enum';
import { SearchableEntityType } from '../../../common/search/search.facade';
import type { AccessPredicate } from '../sources/indexable-source.port';

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
  DataMartSearchIndex,
  DataStorageSearchIndex,
  DataDestinationSearchIndex,
];

function float32Buffer(values: number[]): Buffer {
  const arr = new Float32Array(values);
  return Buffer.from(arr.buffer);
}

function bufferToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

function makeRow(overrides: Partial<SearchIndexRow> = {}): SearchIndexRow {
  return {
    entityId: 'dm-1',
    projectId: 'proj-1',
    isDraft: false,
    embedding: null,
    document: null,
    fieldCount: null,
    docHash: 'abc123',
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

const DATA_MART = SearchableEntityType.DATA_MART;

const PASSTHROUGH_PREDICATE: AccessPredicate = {
  joinSql: '',
  whereSql: '',
  parameters: {},
};

describe('SearchIndexRepository', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let repo: SearchIndexRepository;

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
      ],
      providers: [SearchIndexRepository],
    }).compile();

    dataSource = module.get(getDataSourceToken());
    repo = module.get<SearchIndexRepository>(SearchIndexRepository);
  }, 30_000);

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM data_mart_search_index');
  });

  describe('upsert', () => {
    it('inserts a new row', async () => {
      await repo.upsert(DATA_MART, makeRow());
      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1']);
      expect(state.get('dm-1')?.docHash).toBe('abc123');
    });

    it('updates an existing row on conflict', async () => {
      await repo.upsert(DATA_MART, makeRow({ docHash: 'old-hash' }));
      await repo.upsert(DATA_MART, makeRow({ docHash: 'new-hash' }));

      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1']);
      expect(state.size).toBe(1);
      expect(state.get('dm-1')?.docHash).toBe('new-hash');
    });

    it('round-trips a Buffer embedding', async () => {
      const values = [0.1, 0.2, 0.3, 0.4];
      const buf = float32Buffer(values);
      await repo.upsert(DATA_MART, makeRow({ embedding: buf }));

      const rows: Array<{ entity_id: string; embedding: Buffer }> = await dataSource.query(
        `SELECT entity_id, embedding FROM data_mart_search_index WHERE entity_id = 'dm-1'`
      );
      expect(rows).toHaveLength(1);
      const readBack = rows[0].embedding;
      expect(readBack).not.toBeNull();

      const vec = bufferToFloat32(readBack!);
      expect(vec.length).toBe(4);
      for (let i = 0; i < values.length; i++) {
        expect(vec[i]).toBeCloseTo(values[i], 5);
      }
    });

    it('stores null embedding without error', async () => {
      await repo.upsert(DATA_MART, makeRow({ embedding: null }));

      const rows: Array<{ entity_id: string; embedding: Buffer | null }> = await dataSource.query(
        `SELECT entity_id, embedding FROM data_mart_search_index WHERE entity_id = 'dm-1'`
      );
      expect(rows[0].embedding).toBeNull();
    });

    it('persists embedding_status from embedding presence', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-missing', embedding: null }));
      await repo.upsert(
        DATA_MART,
        makeRow({ entityId: 'dm-ready', embedding: float32Buffer([1, 0]) })
      );

      const rows: Array<{ entity_id: string; embedding_status: string }> = await dataSource.query(
        `SELECT entity_id, embedding_status FROM data_mart_search_index ORDER BY entity_id`
      );

      expect(rows).toEqual([
        { entity_id: 'dm-missing', embedding_status: 'MISSING' },
        { entity_id: 'dm-ready', embedding_status: 'READY' },
      ]);
    });

    it('persists document text and field_count', async () => {
      const doc = JSON.stringify({ title: 'Test', richTextSlots: [], atomicTokenSlots: [] });
      await repo.upsert(DATA_MART, makeRow({ document: doc, fieldCount: 7 }));

      const rows: Array<{ document: string; field_count: number }> = await dataSource.query(
        `SELECT document, field_count FROM data_mart_search_index WHERE entity_id = 'dm-1'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].document).toBe(doc);
      expect(rows[0].field_count).toBe(7);
    });

    it('persists normalized search_text derived from embeddingText only', async () => {
      const doc = JSON.stringify({
        title: 'Revenue Overview',
        description: 'Finance metrics',
        embeddingText: 'Revenue overview finance metrics',
        richTextSlots: [{ kind: 'title', text: 'Revenue Overview' }],
        atomicTokenSlots: [{ kind: 'field', text: 'revenue_amount' }],
      });

      await repo.upsert(DATA_MART, makeRow({ document: doc, fieldCount: 7 }));

      const rows: { search_text: string }[] = await dataSource.query(
        `SELECT search_text FROM data_mart_search_index WHERE entity_id = 'dm-1'`
      );
      expect(rows[0]?.search_text).toBe('revenue overview finance metrics');
      expect(rows[0]?.search_text).not.toContain('revenue amount');
    });

    it('updates document and field_count on subsequent upsert', async () => {
      await repo.upsert(DATA_MART, makeRow({ document: 'old-doc', fieldCount: 3 }));
      await repo.upsert(DATA_MART, makeRow({ document: 'new-doc', fieldCount: 9, docHash: 'h2' }));

      const rows: Array<{ document: string; field_count: number }> = await dataSource.query(
        `SELECT document, field_count FROM data_mart_search_index WHERE entity_id = 'dm-1'`
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].document).toBe('new-doc');
      expect(rows[0].field_count).toBe(9);
    });

    it('does not touch sqlite FTS tables while persisting the base row', async () => {
      const originalQuery = dataSource.query.bind(dataSource);
      const querySpy = jest
        .spyOn(dataSource, 'query')
        .mockImplementation(async (sql: string, parameters?: unknown[]) => {
          expect(sql).not.toContain('_fts');
          return originalQuery(sql, parameters);
        });

      try {
        await expect(
          repo.upsert(
            DATA_MART,
            makeRow({
              document: JSON.stringify({
                title: 'Revenue Overview',
                description: 'Finance metrics',
                embeddingText: 'Revenue overview finance metrics',
                richTextSlots: [{ kind: 'title', text: 'Revenue Overview' }],
                atomicTokenSlots: [],
              }),
            })
          )
        ).resolves.not.toThrow();

        const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1']);
        expect(state.get('dm-1')?.docHash).toBe('abc123');
      } finally {
        querySpy.mockRestore();
      }
    });
  });

  describe('listIndexStateByIds', () => {
    it('returns doc hash and embedding status for requested ids', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-1', docHash: 'h1', embedding: null }));
      await repo.upsert(
        DATA_MART,
        makeRow({ entityId: 'dm-2', docHash: 'h2', embedding: float32Buffer([1, 0]) })
      );

      const map = await repo.listIndexStateByIds(DATA_MART, ['dm-1', 'dm-2', 'nope']);

      expect(map.size).toBe(2);
      expect(map.get('dm-1')).toEqual({
        projectId: 'proj-1',
        docHash: 'h1',
        embeddingStatus: 'MISSING',
      });
      expect(map.get('dm-2')).toEqual({
        projectId: 'proj-1',
        docHash: 'h2',
        embeddingStatus: 'READY',
      });
      expect(map.has('nope')).toBe(false);
    });
  });

  describe('upsertMany', () => {
    it('inserts multiple rows in one call', async () => {
      const rows = [
        makeRow({ entityId: 'dm-a', docHash: 'ha' }),
        makeRow({ entityId: 'dm-b', docHash: 'hb' }),
        makeRow({ entityId: 'dm-c', docHash: 'hc' }),
      ];

      await repo.upsertMany(DATA_MART, rows);

      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-a', 'dm-b', 'dm-c']);
      expect(state.size).toBe(3);
      expect(state.get('dm-a')?.docHash).toBe('ha');
      expect(state.get('dm-b')?.docHash).toBe('hb');
      expect(state.get('dm-c')?.docHash).toBe('hc');
    });

    it('updates existing rows on conflict', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-1', docHash: 'old' }));

      await repo.upsertMany(DATA_MART, [makeRow({ entityId: 'dm-1', docHash: 'new' })]);

      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1']);
      expect(state.get('dm-1')?.docHash).toBe('new');
    });

    it('is a no-op for an empty array', async () => {
      await expect(repo.upsertMany(DATA_MART, [])).resolves.not.toThrow();
    });

    it('stores isDraft=true correctly', async () => {
      await repo.upsertMany(DATA_MART, [makeRow({ entityId: 'dm-draft', isDraft: true })]);

      const rows: Array<{ entity_id: string; is_draft: number }> = await dataSource.query(
        `SELECT entity_id, is_draft FROM data_mart_search_index WHERE entity_id = 'dm-draft'`
      );
      expect(rows[0]?.is_draft).toBe(1);
    });
  });

  describe('deleteOrphans', () => {
    let storageRepo: Repository<DataStorage>;
    let martRepo: Repository<DataMart>;

    beforeAll(() => {
      storageRepo = dataSource.getRepository(DataStorage);
      martRepo = dataSource.getRepository(DataMart);
    });

    afterEach(async () => {
      await dataSource.query('DELETE FROM data_mart');
      await dataSource.query('DELETE FROM data_storage');
    });

    it('removes index rows whose entity no longer exists in data_mart', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'orphan-1' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'orphan-2' }));

      const deleted = await repo.deleteOrphans(DATA_MART);
      expect(deleted).toBe(2);

      const rows: unknown[] = await dataSource.query(
        `SELECT entity_id FROM data_mart_search_index`
      );
      expect(rows).toHaveLength(0);
    });

    it('removes only project-scoped orphan rows when projectId is provided', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'orphan-1', projectId: 'proj-1' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'orphan-2', projectId: 'proj-2' }));

      const deleted = await repo.deleteOrphans(DATA_MART, 'proj-1');

      expect(deleted).toBe(1);
      const rows: Array<{ entity_id: string; project_id: string }> = await dataSource.query(
        `SELECT entity_id, project_id FROM data_mart_search_index ORDER BY entity_id`
      );
      expect(rows).toEqual([{ entity_id: 'orphan-2', project_id: 'proj-2' }]);
    });

    it('keeps index rows whose entity is live (not soft-deleted)', async () => {
      const storage = storageRepo.create();
      storage.type = DataStorageType.GOOGLE_BIGQUERY;
      storage.projectId = 'proj-1';
      storage.createdById = 'user-1';
      const savedStorage = await storageRepo.save(storage);

      const mart = martRepo.create();
      mart.title = 'Live Mart';
      mart.projectId = 'proj-1';
      mart.status = DataMartStatus.PUBLISHED;
      mart.createdById = 'user-1';
      mart.storage = savedStorage;
      const savedMart = await martRepo.save(mart);

      await repo.upsert(DATA_MART, makeRow({ entityId: savedMart.id, projectId: 'proj-1' }));

      const deleted = await repo.deleteOrphans(DATA_MART);
      expect(deleted).toBe(0);

      const state = await repo.listIndexStateByIds(DATA_MART, [savedMart.id]);
      expect(state.has(savedMart.id)).toBe(true);
    });

    it('removes index rows whose live entity moved to a different project', async () => {
      const storage = storageRepo.create();
      storage.type = DataStorageType.GOOGLE_BIGQUERY;
      storage.projectId = 'proj-2';
      storage.createdById = 'user-1';
      const savedStorage = await storageRepo.save(storage);

      const mart = martRepo.create();
      mart.title = 'Moved Mart';
      mart.projectId = 'proj-2';
      mart.status = DataMartStatus.PUBLISHED;
      mart.createdById = 'user-1';
      mart.storage = savedStorage;
      const savedMart = await martRepo.save(mart);

      await repo.upsert(DATA_MART, makeRow({ entityId: savedMart.id, projectId: 'proj-1' }));

      const deleted = await repo.deleteOrphans(DATA_MART, 'proj-1');
      expect(deleted).toBe(1);

      const state = await repo.listIndexStateByIds(DATA_MART, [savedMart.id]);
      expect(state.has(savedMart.id)).toBe(false);
    });

    it('returns 0 when the index table is empty', async () => {
      const deleted = await repo.deleteOrphans(DATA_MART);
      expect(deleted).toBe(0);
    });
  });

  describe('deleteByEntityIdAndProjectId', () => {
    it('deletes only the row that matches both entityId and projectId', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-1', projectId: 'proj-1' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-2', projectId: 'proj-2' }));

      const deleted = await repo.deleteByEntityIdAndProjectId(DATA_MART, 'dm-1', 'proj-2');
      expect(deleted).toBe(0);

      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1', 'dm-2']);
      expect([...state.keys()]).toEqual(['dm-1', 'dm-2']);
    });
  });

  describe('deleteByEntityId', () => {
    it('deletes the index row without touching sqlite FTS tables', async () => {
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-1',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Revenue',
            description: null,
            embeddingText: 'Revenue',
            richTextSlots: [{ kind: 'title', text: 'Revenue' }],
            atomicTokenSlots: [],
          }),
        })
      );

      const originalQuery = dataSource.query.bind(dataSource);
      const querySpy = jest
        .spyOn(dataSource, 'query')
        .mockImplementation(async (sql: string, parameters?: unknown[]) => {
          expect(sql).not.toContain('_fts');
          return originalQuery(sql, parameters);
        });

      try {
        const deleted = await repo.deleteByEntityId(DATA_MART, 'dm-1');
        expect(deleted).toBe(1);
        const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1']);
        expect(state.size).toBe(0);
      } finally {
        querySpy.mockRestore();
      }
    });
  });

  describe('deleteByEntityIds', () => {
    it('deletes requested index rows in one call', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-1' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-2' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-3' }));

      const deleted = await repo.deleteByEntityIds(DATA_MART, ['dm-1', 'dm-3']);

      expect(deleted).toBe(2);
      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1', 'dm-2', 'dm-3']);
      expect([...state.keys()]).toEqual(['dm-2']);
    });

    it('returns 0 for an empty id list', async () => {
      await expect(repo.deleteByEntityIds(DATA_MART, [])).resolves.toBe(0);
    });
  });

  describe('searchCandidates', () => {
    it('returns only matching bounded candidates for a prompt', async () => {
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-1',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Revenue Overview',
            description: 'Finance metrics',
            embeddingText: 'Revenue overview finance metrics',
            richTextSlots: [{ kind: 'title', text: 'Revenue Overview' }],
            atomicTokenSlots: [],
          }),
        })
      );
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-2',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Revenue Forecast',
            description: 'Quarterly plan',
            embeddingText: 'Revenue forecast quarterly plan',
            richTextSlots: [{ kind: 'title', text: 'Revenue Forecast' }],
            atomicTokenSlots: [],
          }),
        })
      );
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-3',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Storage Inventory',
            description: 'Warehouse stock',
            embeddingText: 'Storage inventory warehouse stock',
            richTextSlots: [{ kind: 'title', text: 'Storage Inventory' }],
            atomicTokenSlots: [],
          }),
        })
      );

      const page = await repo.searchCandidates(
        DATA_MART,
        'proj-1',
        PASSTHROUGH_PREDICATE,
        'revenue',
        {
          candidateLimit: 1,
        }
      );

      expect(page.nextCursor).toBeNull();
      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.entityId).toMatch(/^dm-[12]$/);
    });

    it('includes matching rows without embeddings in keyword fallback search', async () => {
      const revenueDocument = JSON.stringify({
        title: 'Revenue Overview',
        description: 'Finance metrics',
        embeddingText: 'Revenue overview finance metrics',
        richTextSlots: [{ kind: 'title', text: 'Revenue Overview' }],
        atomicTokenSlots: [],
      });
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-missing',
          embedding: null,
          document: revenueDocument,
        })
      );
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-ready',
          embedding: float32Buffer([1, 0]),
          document: revenueDocument,
        })
      );

      const page = await repo.searchCandidates(
        DATA_MART,
        'proj-1',
        PASSTHROUGH_PREDICATE,
        'revenue',
        {
          candidateLimit: 10,
        }
      );

      expect(page.rows.map(row => row.entityId).sort()).toEqual(['dm-missing', 'dm-ready']);
    });

    it('uses persisted search_text so updated rows stop matching stale terms', async () => {
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-1',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Revenue Overview',
            description: 'Finance metrics',
            embeddingText: 'Revenue overview finance metrics',
            richTextSlots: [{ kind: 'title', text: 'Revenue Overview' }],
            atomicTokenSlots: [],
          }),
        })
      );

      let page = await repo.searchCandidates(
        DATA_MART,
        'proj-1',
        PASSTHROUGH_PREDICATE,
        'revenue',
        {
          candidateLimit: 10,
        }
      );
      expect(page.rows.map(row => row.entityId)).toEqual(['dm-1']);

      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-1',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Storage Overview',
            description: 'Warehouse metrics',
            embeddingText: 'Storage overview warehouse metrics',
            richTextSlots: [{ kind: 'title', text: 'Storage Overview' }],
            atomicTokenSlots: [],
          }),
          docHash: 'h2',
        })
      );

      page = await repo.searchCandidates(DATA_MART, 'proj-1', PASSTHROUGH_PREDICATE, 'revenue', {
        candidateLimit: 10,
      });
      expect(page.rows).toHaveLength(0);
    });

    it('uses LIKE search on sqlite and never queries FTS tables', async () => {
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-1',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Revenue Overview',
            description: 'Finance metrics',
            embeddingText: 'Revenue overview finance metrics',
            richTextSlots: [{ kind: 'title', text: 'Revenue Overview' }],
            atomicTokenSlots: [],
          }),
        })
      );

      const originalQuery = dataSource.query.bind(dataSource);
      const querySpy = jest
        .spyOn(dataSource, 'query')
        .mockImplementation(async (sql: string, parameters?: unknown[]) => {
          expect(sql).not.toContain('_fts');
          expect(sql).not.toContain('MATCH ?');
          return originalQuery(sql, parameters);
        });

      try {
        const page = await repo.searchCandidates(
          DATA_MART,
          'proj-1',
          PASSTHROUGH_PREDICATE,
          'revenue',
          {
            candidateLimit: 10,
          }
        );

        expect(page.rows.map(row => row.entityId)).toEqual(['dm-1']);
      } finally {
        querySpy.mockRestore();
      }
    });

    it('logs sqlite LIKE candidate mode and SQL query', async () => {
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-1',
          embedding: float32Buffer([1, 0]),
          document: JSON.stringify({
            title: 'Revenue Overview',
            description: 'Finance metrics',
            embeddingText: 'Revenue overview finance metrics',
            richTextSlots: [{ kind: 'title', text: 'Revenue Overview' }],
            atomicTokenSlots: [],
          }),
        })
      );

      const logSpy = jest.spyOn(repo['logger'], 'log').mockImplementation(() => undefined);

      try {
        await repo.searchCandidates(DATA_MART, 'proj-1', PASSTHROUGH_PREDICATE, 'revenue', {
          candidateLimit: 10,
        });

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('advanced-search database candidate search mode')
        );
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('mode=like'));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(`entityType=${DATA_MART}`));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tokenCount=1'));
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('advanced-search database candidate SQL query')
        );
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('idx.search_text LIKE ?'));
        expect(logSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('idx.embedding IS NOT NULL')
        );
        expect(logSpy).not.toHaveBeenCalledWith('[object Object]');
      } finally {
        logSpy.mockRestore();
      }
    });

    it('logs mysql FULLTEXT candidate mode and SQL query', async () => {
      const mysqlDs = {
        options: { type: 'mysql' },
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
            return [{ INDEX_NAME: 'ftx_data_mart_search_index_search_text' }];
          }
          if (sql.includes('MATCH(idx.search_text)')) {
            return [
              {
                entity_id: 'dm-1',
                project_id: 'proj-1',
                is_draft: 0,
                embedding: float32Buffer([1, 0]),
                document: null,
                field_count: 1,
                doc_hash: 'h1',
                updated_at: '2024-01-01 00:00:00',
              },
            ];
          }
          return [];
        }),
      } as unknown as DataSource;
      const mysqlRepo = new SearchIndexRepository(mysqlDs);
      const logSpy = jest.spyOn(mysqlRepo['logger'], 'log').mockImplementation(() => undefined);

      try {
        await mysqlRepo.searchCandidates(DATA_MART, 'proj-1', PASSTHROUGH_PREDICATE, 'revenue', {
          candidateLimit: 10,
        });

        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('advanced-search database candidate search mode')
        );
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('mode=fulltext'));
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('MATCH(idx.search_text) AGAINST (? IN BOOLEAN MODE)')
        );
        expect(logSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('idx.embedding IS NOT NULL')
        );
        expect(logSpy).not.toHaveBeenCalledWith('[object Object]');
      } finally {
        logSpy.mockRestore();
      }
    });

    it('uses Cloud SQL vector distance search when mysql vector support is enabled', async () => {
      const promptVec = new Float32Array([1, 0]);
      const mysqlDs = {
        options: { type: 'mysql' },
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes("SHOW VARIABLES LIKE 'cloudsql_vector'")) {
            return [{ Variable_name: 'cloudsql_vector', Value: 'ON' }];
          }
          if (sql.includes('COSINE_DISTANCE(idx.embedding, ?)')) {
            return [
              {
                entity_id: 'dm-1',
                project_id: 'proj-1',
                is_draft: 0,
                embedding: Buffer.from(promptVec.buffer),
                document: null,
                field_count: 1,
                doc_hash: 'h1',
                updated_at: '2024-01-01 00:00:00',
              },
            ];
          }
          return [];
        }),
      } as unknown as DataSource;
      const mysqlRepo = new SearchIndexRepository(mysqlDs);
      const logSpy = jest.spyOn(mysqlRepo['logger'], 'log').mockImplementation(() => undefined);

      try {
        const page = await mysqlRepo.searchCandidates(
          DATA_MART,
          'proj-1',
          PASSTHROUGH_PREDICATE,
          'revenue',
          {
            candidateLimit: 10,
            promptVec,
          }
        );

        expect(page.rows.map(row => row.entityId)).toEqual(['dm-1']);
        expect(mysqlDs.query).toHaveBeenCalledWith(
          expect.stringContaining('COSINE_DISTANCE(idx.embedding, ?)'),
          expect.arrayContaining([expect.any(Buffer)])
        );
        expect(mysqlDs.query).not.toHaveBeenCalledWith(
          expect.stringContaining('MATCH(idx.search_text)'),
          expect.anything()
        );
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('mode=vector'));
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('COSINE_DISTANCE(idx.embedding, ?)')
        );
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('idx.embedding IS NOT NULL'));
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('advanced-search database candidate query result')
        );
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('resultCount=1'));
      } finally {
        logSpy.mockRestore();
      }
    });

    it('passes vectorCandidateLimit to the mysql vector branch query', async () => {
      const promptVec = new Float32Array([1, 0]);
      const mysqlDs = {
        options: { type: 'mysql' },
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes("SHOW VARIABLES LIKE 'cloudsql_vector'")) {
            return [{ Variable_name: 'cloudsql_vector', Value: 'ON' }];
          }
          return [];
        }),
      } as unknown as DataSource;
      const mysqlRepo = new SearchIndexRepository(mysqlDs);

      await mysqlRepo.searchCandidates(DATA_MART, 'proj-1', PASSTHROUGH_PREDICATE, 'revenue', {
        candidateLimit: 5,
        vectorCandidateLimit: 10,
        promptVec,
      });

      const vectorCall = (mysqlDs.query as jest.Mock).mock.calls.find((c: string[]) =>
        c[0].includes('COSINE_DISTANCE')
      );
      expect(vectorCall).toBeDefined();
      expect(vectorCall[1]).toContain(10);
    });

    it('retries mysql vector search after the vector error cooldown expires', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const promptVec = new Float32Array([1, 0]);
      const queryMock = jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("SHOW VARIABLES LIKE 'cloudsql_vector'")) {
          return [{ Variable_name: 'cloudsql_vector', Value: 'ON' }];
        }
        if (sql.includes('COSINE_DISTANCE(idx.embedding, ?)')) {
          const vectorCalls = queryMock.mock.calls.filter(([callSql]) =>
            String(callSql).includes('COSINE_DISTANCE')
          ).length;
          if (vectorCalls === 1) {
            throw new Error('dimension mismatch');
          }
          return [
            {
              entity_id: 'dm-1',
              project_id: 'proj-1',
              is_draft: 0,
              embedding: Buffer.from(promptVec.buffer),
              document: null,
              field_count: 1,
              doc_hash: 'h1',
              updated_at: '2024-01-01 00:00:00',
            },
          ];
        }
        return [];
      });
      const mysqlDs = {
        options: { type: 'mysql' },
        query: queryMock,
      } as unknown as DataSource;
      const mysqlRepo = new SearchIndexRepository(mysqlDs);

      try {
        await mysqlRepo.searchCandidates(DATA_MART, 'proj-1', PASSTHROUGH_PREDICATE, 'revenue', {
          candidateLimit: 10,
          promptVec,
        });
        await mysqlRepo.searchCandidates(DATA_MART, 'proj-1', PASSTHROUGH_PREDICATE, 'revenue', {
          candidateLimit: 10,
          promptVec,
        });

        let vectorCalls = (mysqlDs.query as jest.Mock).mock.calls.filter(([sql]) =>
          String(sql).includes('COSINE_DISTANCE')
        );
        expect(vectorCalls).toHaveLength(1);

        jest.advanceTimersByTime(60_001);
        const page = await mysqlRepo.searchCandidates(
          DATA_MART,
          'proj-1',
          PASSTHROUGH_PREDICATE,
          'revenue',
          {
            candidateLimit: 10,
            promptVec,
          }
        );

        vectorCalls = (mysqlDs.query as jest.Mock).mock.calls.filter(([sql]) =>
          String(sql).includes('COSINE_DISTANCE')
        );
        expect(vectorCalls).toHaveLength(2);
        expect(page.rows.map(row => row.entityId)).toEqual(['dm-1']);
      } finally {
        jest.useRealTimers();
      }
    });

    it('falls back to LIKE search when mysql FULLTEXT query fails', async () => {
      const mysqlDs = {
        options: { type: 'mysql' },
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
            return [{ INDEX_NAME: 'ftx_data_mart_search_index_search_text' }];
          }
          if (sql.includes('MATCH(idx.search_text)')) {
            throw new Error('fulltext unavailable');
          }
          if (sql.includes('idx.search_text LIKE')) {
            return [
              {
                entity_id: 'dm-1',
                project_id: 'proj-1',
                is_draft: 0,
                embedding: float32Buffer([1, 0]),
                document: null,
                field_count: 1,
                doc_hash: 'h1',
                updated_at: '2024-01-01 00:00:00',
              },
            ];
          }
          return [];
        }),
      } as unknown as DataSource;
      const mysqlRepo = new SearchIndexRepository(mysqlDs);

      const page = await mysqlRepo.searchCandidates(
        DATA_MART,
        'proj-1',
        PASSTHROUGH_PREDICATE,
        'revenue',
        {
          candidateLimit: 10,
        }
      );

      expect(page.rows.map(row => row.entityId)).toEqual(['dm-1']);
    });

    it('uses a portable LIKE escape character in fallback search', async () => {
      const mysqlDs = {
        options: { type: 'mysql' },
        query: jest.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) {
            return [];
          }
          return [];
        }),
      } as unknown as DataSource;
      const mysqlRepo = new SearchIndexRepository(mysqlDs);

      await mysqlRepo.searchCandidates(DATA_MART, 'proj-1', PASSTHROUGH_PREDICATE, '100%_safe!', {
        candidateLimit: 10,
      });

      const fallbackCall = (mysqlDs.query as jest.Mock).mock.calls.find(([sql]) =>
        String(sql).includes('idx.search_text LIKE')
      );
      expect(fallbackCall?.[0]).toContain("ESCAPE '!'");
      expect(mysqlRepo['escapeLikePattern']('100%_safe!')).toBe('100!%!_safe!!');
    });
  });

  describe('searchCandidates — access predicate JOIN filtering', () => {
    let storageRepo: Repository<DataStorage>;
    let martRepo: Repository<DataMart>;

    beforeAll(() => {
      storageRepo = dataSource.getRepository(DataStorage);
      martRepo = dataSource.getRepository(DataMart);
    });

    afterEach(async () => {
      await dataSource.query('DELETE FROM data_mart_search_index');
      await dataSource.query('DELETE FROM data_mart');
      await dataSource.query('DELETE FROM data_storage');
    });

    async function seedStorage(): Promise<DataStorage> {
      const s = storageRepo.create();
      s.type = DataStorageType.GOOGLE_BIGQUERY;
      s.projectId = 'proj-1';
      s.createdById = 'user-1';
      return storageRepo.save(s);
    }

    async function seedMart(
      storage: DataStorage,
      overrides: Partial<DataMart> = {}
    ): Promise<DataMart> {
      const m = martRepo.create();
      m.title = 'Test Mart';
      m.projectId = 'proj-1';
      m.status = DataMartStatus.DRAFT;
      m.createdById = 'user-1';
      m.storage = storage;
      Object.assign(m, overrides);
      return martRepo.save(m);
    }

    async function seedIndexRow(entityId: string, projectId = 'proj-1'): Promise<void> {
      await repo.upsert(
        DATA_MART,
        makeRow({ entityId, projectId, embedding: float32Buffer([1, 0]) })
      );
    }

    function dataMartJoinPredicate(
      extraWhere?: string,
      extraParams?: Record<string, unknown>
    ): AccessPredicate {
      const base = `dm.status = :dmStatus AND dm.deletedAt IS NULL`;
      return {
        joinSql: `JOIN data_mart dm ON dm.id = idx.entity_id`,
        whereSql: extraWhere ? `${base} AND ${extraWhere}` : base,
        parameters: { dmStatus: DataMartStatus.PUBLISHED, ...extraParams },
      };
    }

    async function readAllVisibleIds(predicate: AccessPredicate): Promise<Set<string>> {
      const page = await repo.searchCandidates(DATA_MART, 'proj-1', predicate, '', {
        candidateLimit: 1000,
      });
      return new Set(page.rows.map(r => r.entityId));
    }

    it('returns only PUBLISHED rows when the base gate is applied', async () => {
      const storage = await seedStorage();
      const published = await seedMart(storage, { status: DataMartStatus.PUBLISHED });
      const draft = await seedMart(storage, { title: 'Draft', status: DataMartStatus.DRAFT });

      await seedIndexRow(published.id);
      await seedIndexRow(draft.id);

      const ids = await readAllVisibleIds(dataMartJoinPredicate());
      expect(ids.has(published.id)).toBe(true);
      expect(ids.has(draft.id)).toBe(false);
    });

    it('excludes soft-deleted data marts', async () => {
      const storage = await seedStorage();
      const mart = await seedMart(storage, { status: DataMartStatus.PUBLISHED });
      await martRepo.softDelete(mart.id);
      await seedIndexRow(mart.id);

      const ids = await readAllVisibleIds(dataMartJoinPredicate());
      expect(ids.size).toBe(0);
    });

    it('excludes index rows whose data_mart row no longer exists', async () => {
      await seedIndexRow('orphaned-id', 'proj-1');

      const ids = await readAllVisibleIds(dataMartJoinPredicate());
      expect(ids.size).toBe(0);
    });

    it('returns only shared-for-reporting marts when availableForReporting gate is applied', async () => {
      const storage = await seedStorage();
      const shared = await seedMart(storage, {
        status: DataMartStatus.PUBLISHED,
        availableForReporting: true,
      });
      const restricted = await seedMart(storage, {
        title: 'Restricted',
        status: DataMartStatus.PUBLISHED,
        availableForReporting: false,
      });
      await seedIndexRow(shared.id);
      await seedIndexRow(restricted.id);

      const predicate = dataMartJoinPredicate(`dm.availableForReporting = :isTrue`, { isTrue: 1 });
      const ids = await readAllVisibleIds(predicate);
      expect(ids.has(shared.id)).toBe(true);
      expect(ids.has(restricted.id)).toBe(false);
    });

    it('passthrough predicate returns rows regardless of mart status', async () => {
      const storage = await seedStorage();
      const draft = await seedMart(storage, { status: DataMartStatus.DRAFT });
      await seedIndexRow(draft.id);

      const ids = await readAllVisibleIds(PASSTHROUGH_PREDICATE);
      expect(ids.has(draft.id)).toBe(true);
    });
  });
});

describe('SearchIndexRepository — multi-type isolation', () => {
  let module: TestingModule;
  let dataSource: DataSource;
  let repo: SearchIndexRepository;

  const DATA_STORAGE = SearchableEntityType.DATA_STORAGE;
  const DATA_DESTINATION = SearchableEntityType.DATA_DESTINATION;

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
      ],
      providers: [SearchIndexRepository],
    }).compile();

    dataSource = module.get(getDataSourceToken());
    repo = module.get(SearchIndexRepository);
  }, 30_000);

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM data_mart_search_index');
    await dataSource.query('DELETE FROM data_storage_search_index');
    await dataSource.query('DELETE FROM data_destination_search_index');
  });

  async function tableColumnNames(tableName: string): Promise<string[]> {
    const rows: Array<{ name: string }> = await dataSource.query(`PRAGMA table_info(${tableName})`);
    return rows.map(row => row.name);
  }

  it('keeps draft and field-count columns only on the data mart index table', async () => {
    await expect(tableColumnNames('data_mart_search_index')).resolves.toEqual(
      expect.arrayContaining(['is_draft', 'field_count'])
    );
    await expect(tableColumnNames('data_storage_search_index')).resolves.not.toEqual(
      expect.arrayContaining(['is_draft', 'field_count'])
    );
    await expect(tableColumnNames('data_destination_search_index')).resolves.not.toEqual(
      expect.arrayContaining(['is_draft', 'field_count'])
    );
  });

  it('upsert into DATA_STORAGE does not appear in DATA_MART or DATA_DESTINATION tables', async () => {
    await repo.upsert(DATA_STORAGE, makeRow({ entityId: 'st-1', projectId: 'proj-1' }));

    const martState = await repo.listIndexStateByIds(SearchableEntityType.DATA_MART, ['st-1']);
    const destState = await repo.listIndexStateByIds(DATA_DESTINATION, ['st-1']);
    expect(martState.size).toBe(0);
    expect(destState.size).toBe(0);

    const storageState = await repo.listIndexStateByIds(DATA_STORAGE, ['st-1']);
    expect(storageState.get('st-1')?.docHash).toBe('abc123');
  });

  it('upsert into DATA_DESTINATION does not appear in DATA_MART or DATA_STORAGE tables', async () => {
    await repo.upsert(DATA_DESTINATION, makeRow({ entityId: 'dest-1', projectId: 'proj-1' }));

    const martState = await repo.listIndexStateByIds(SearchableEntityType.DATA_MART, ['dest-1']);
    const storageState = await repo.listIndexStateByIds(DATA_STORAGE, ['dest-1']);
    expect(martState.size).toBe(0);
    expect(storageState.size).toBe(0);

    const destState = await repo.listIndexStateByIds(DATA_DESTINATION, ['dest-1']);
    expect(destState.get('dest-1')?.docHash).toBe('abc123');
  });

  it('same entityId in two different type tables are independent rows', async () => {
    const sharedId = 'shared-id';
    await repo.upsert(DATA_MART, makeRow({ entityId: sharedId, docHash: 'mart-hash' }));
    await repo.upsert(DATA_STORAGE, makeRow({ entityId: sharedId, docHash: 'storage-hash' }));
    await repo.upsert(DATA_DESTINATION, makeRow({ entityId: sharedId, docHash: 'dest-hash' }));

    expect(
      (await repo.listIndexStateByIds(SearchableEntityType.DATA_MART, [sharedId])).get(sharedId)
        ?.docHash
    ).toBe('mart-hash');
    expect((await repo.listIndexStateByIds(DATA_STORAGE, [sharedId])).get(sharedId)?.docHash).toBe(
      'storage-hash'
    );
    expect(
      (await repo.listIndexStateByIds(DATA_DESTINATION, [sharedId])).get(sharedId)?.docHash
    ).toBe('dest-hash');
  });

  it('deleteOrphans on DATA_STORAGE leaves DATA_MART and DATA_DESTINATION untouched', async () => {
    await repo.upsert(SearchableEntityType.DATA_MART, makeRow({ entityId: 'dm-keep' }));
    await repo.upsert(DATA_STORAGE, makeRow({ entityId: 'st-orphan' }));
    await repo.upsert(DATA_DESTINATION, makeRow({ entityId: 'dest-keep' }));

    const deleted = await repo.deleteOrphans(DATA_STORAGE);
    expect(deleted).toBe(1);

    const storageState = await repo.listIndexStateByIds(DATA_STORAGE, ['st-orphan']);
    expect(storageState.size).toBe(0);
    const martState = await repo.listIndexStateByIds(SearchableEntityType.DATA_MART, ['dm-keep']);
    expect(martState.get('dm-keep')?.docHash).toBe('abc123');
    const destState = await repo.listIndexStateByIds(DATA_DESTINATION, ['dest-keep']);
    expect(destState.get('dest-keep')?.docHash).toBe('abc123');
  });

  it('searchCandidates returns only rows for the requested entity type', async () => {
    await repo.upsert(
      DATA_STORAGE,
      makeRow({ entityId: 'st-A', projectId: 'proj-1', embedding: float32Buffer([1, 0]) })
    );
    await repo.upsert(
      DATA_STORAGE,
      makeRow({ entityId: 'st-B', projectId: 'proj-1', embedding: float32Buffer([1, 0]) })
    );
    await repo.upsert(
      DATA_DESTINATION,
      makeRow({ entityId: 'dest-A', projectId: 'proj-1', embedding: float32Buffer([1, 0]) })
    );
    await repo.upsert(
      SearchableEntityType.DATA_MART,
      makeRow({ entityId: 'dm-A', projectId: 'proj-1', embedding: float32Buffer([1, 0]) })
    );

    const storagePage = await repo.searchCandidates(
      DATA_STORAGE,
      'proj-1',
      PASSTHROUGH_PREDICATE,
      '',
      { candidateLimit: 10 }
    );
    const storageIds = new Set(storagePage.rows.map(r => r.entityId));
    expect(storageIds).toEqual(new Set(['st-A', 'st-B']));

    const destPage = await repo.searchCandidates(
      DATA_DESTINATION,
      'proj-1',
      PASSTHROUGH_PREDICATE,
      '',
      { candidateLimit: 10 }
    );
    const destIds = new Set(destPage.rows.map(r => r.entityId));
    expect(destIds).toEqual(new Set(['dest-A']));
  });

  it('uses runtime draft and field-count constants for storage search candidates', async () => {
    const originalQuery = dataSource.query.bind(dataSource);
    const querySpy = jest
      .spyOn(dataSource, 'query')
      .mockImplementation(async (sql: string, parameters?: unknown[]) =>
        originalQuery(sql, parameters)
      );

    try {
      await repo.upsert(
        DATA_STORAGE,
        makeRow({ entityId: 'st-constant', projectId: 'proj-1', embedding: float32Buffer([1, 0]) })
      );

      const page = await repo.searchCandidates(DATA_STORAGE, 'proj-1', PASSTHROUGH_PREDICATE, '', {
        candidateLimit: 10,
        excludeDrafts: true,
      });

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]).toMatchObject({
        entityId: 'st-constant',
        isDraft: false,
        fieldCount: 0,
      });

      const searchCall = querySpy.mock.calls.find(([sql]) =>
        String(sql).includes('FROM data_storage_search_index idx')
      );
      expect(searchCall?.[0]).toContain('0 AS is_draft');
      expect(searchCall?.[0]).toContain('0 AS field_count');
      expect(searchCall?.[0]).not.toContain('idx.is_draft');
      expect(searchCall?.[0]).not.toContain('idx.field_count');
    } finally {
      querySpy.mockRestore();
    }
  });
});
