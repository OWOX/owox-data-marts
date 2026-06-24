import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import {
  SearchIndexRepository,
  SearchIndexRow,
} from 'src/data-marts/search/schema/search-index.repository';
import { vecToBuffer } from 'src/data-marts/search/embedding/vector-codec';
import { SearchableEntityType } from 'src/common/search/search.facade';
import type { AccessPredicate } from 'src/data-marts/search/sources/indexable-source.port';
import { DataMartSearchIndex } from 'src/data-marts/entities/search/data-mart-search-index.entity';
import { DataStorageSearchIndex } from 'src/data-marts/entities/search/data-storage-search-index.entity';
import { DataDestinationSearchIndex } from 'src/data-marts/entities/search/data-destination-search-index.entity';
import { CreateSearchIndexTables1782131671353 } from 'src/migrations/1782131671353-create-search-index-tables';

const MYSQL_HOST = process.env.ADVANCED_SEARCH_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.ADVANCED_SEARCH_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.ADVANCED_SEARCH_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.ADVANCED_SEARCH_MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.ADVANCED_SEARCH_MYSQL_DATABASE ?? 'owox_test';

const DATA_MART = SearchableEntityType.DATA_MART;
const PASSTHROUGH_PREDICATE: AccessPredicate = {
  joinSql: '',
  whereSql: '',
  parameters: {},
};

const available = !!MYSQL_HOST;

if (!available) {
  console.log('Skipping advanced-search MySQL integration tests: ADVANCED_SEARCH_MYSQL_HOST unset');
}

if (available && !MYSQL_PASSWORD) {
  throw new Error(
    'ADVANCED_SEARCH_MYSQL_HOST is set but ADVANCED_SEARCH_MYSQL_PASSWORD is empty. ' +
      'Set ADVANCED_SEARCH_MYSQL_PASSWORD to run the integration tests.'
  );
}

const describeIfAvailable = available ? describe : describe.skip;

function makeDocument(title: string, description = ''): string {
  return JSON.stringify({
    title,
    description,
    embeddingText: [title, description].filter(Boolean).join('\n'),
    richTextSlots: [
      { kind: 'title', text: title },
      ...(description ? [{ kind: 'description', text: description }] : []),
    ],
    atomicTokenSlots: [{ kind: 'field', text: 'revenue_amount' }],
  });
}

function makeRow(overrides: Partial<SearchIndexRow> = {}): SearchIndexRow {
  return {
    entityId: 'dm-1',
    projectId: 'proj-1',
    isDraft: false,
    embedding: null,
    document: makeDocument('Revenue Overview', 'Finance metrics'),
    fieldCount: 1,
    docHash: 'abc123',
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describeIfAvailable('Advanced Search — MySQL schema layer (integration)', () => {
  let dataSource: DataSource;
  let repo: SearchIndexRepository;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: [DataMartSearchIndex, DataStorageSearchIndex, DataDestinationSearchIndex],
      migrations: [CreateSearchIndexTables1782131671353],
      migrationsTransactionMode: 'none',
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    for (const table of [
      'search_reindex_triggers',
      'data_mart_search_index',
      'data_storage_search_index',
      'data_destination_search_index',
      'migrations',
    ]) {
      await dataSource.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await dataSource.runMigrations({ transaction: 'none' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchIndexRepository, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();

    repo = module.get<SearchIndexRepository>(SearchIndexRepository);
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DROP TABLE IF EXISTS data_mart_search_index').catch(() => undefined);
      await dataSource
        .query('DROP TABLE IF EXISTS data_storage_search_index')
        .catch(() => undefined);
      await dataSource
        .query('DROP TABLE IF EXISTS data_destination_search_index')
        .catch(() => undefined);
      await dataSource.query('DROP TABLE IF EXISTS search_reindex_triggers').catch(() => undefined);
      await dataSource.destroy();
    }
  }, 15000);

  afterEach(async () => {
    await dataSource.query('DELETE FROM data_mart_search_index');
  });

  describe('index table structure', () => {
    it('creates index tables with search_text, embedding_status columns and MySQL FULLTEXT index', async () => {
      const tables: { TABLE_NAME: string }[] = await dataSource.query(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME IN ('data_mart_search_index', 'data_storage_search_index', 'data_destination_search_index')`,
        [MYSQL_DATABASE]
      );
      expect(tables.map(row => row.TABLE_NAME).sort()).toEqual([
        'data_destination_search_index',
        'data_mart_search_index',
        'data_storage_search_index',
      ]);

      const columns: { COLUMN_NAME: string }[] = await dataSource.query(
        `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'data_mart_search_index'
           AND COLUMN_NAME IN ('entity_id', 'search_text', 'embedding_status')`,
        [MYSQL_DATABASE]
      );
      expect(columns.map(row => row.COLUMN_NAME).sort()).toEqual([
        'embedding_status',
        'entity_id',
        'search_text',
      ]);

      const indexes: { INDEX_NAME: string; INDEX_TYPE: string }[] = await dataSource.query(
        `SELECT INDEX_NAME, INDEX_TYPE
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = 'data_mart_search_index'
           AND INDEX_NAME IN ('idx_data_mart_search_index_project', 'idx_data_mart_search_index_project_entity', 'ftx_data_mart_search_index_search_text')`,
        [MYSQL_DATABASE]
      );
      expect(indexes.map(row => row.INDEX_NAME)).toEqual(
        expect.arrayContaining([
          'idx_data_mart_search_index_project',
          'idx_data_mart_search_index_project_entity',
          'ftx_data_mart_search_index_search_text',
        ])
      );
      expect(
        indexes.find(row => row.INDEX_NAME === 'ftx_data_mart_search_index_search_text')?.INDEX_TYPE
      ).toBe('FULLTEXT');
    }, 15000);
  });

  describe('SearchIndexRepository', () => {
    it('upserts rows and returns hash plus embedding status by ids', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-1', docHash: 'h1' }));
      await repo.upsert(
        DATA_MART,
        makeRow({ entityId: 'dm-2', docHash: 'h2', embedding: vecToBuffer(new Float32Array([1])) })
      );

      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1', 'dm-2', 'missing']);

      expect(state.get('dm-1')).toEqual({ docHash: 'h1', embeddingStatus: 'MISSING' });
      expect(state.get('dm-2')).toEqual({ docHash: 'h2', embeddingStatus: 'READY' });
      expect(state.has('missing')).toBe(false);
    });

    it('scopes candidate rows by project', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-1', projectId: 'proj-A' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-2', projectId: 'proj-B' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-3', projectId: 'proj-A' }));

      const page = await repo.searchCandidates(DATA_MART, 'proj-A', PASSTHROUGH_PREDICATE, '', {
        candidateLimit: 10,
      });

      expect(page.rows.map(r => r.entityId).sort()).toEqual(['dm-1', 'dm-3']);
    });

    it('uses MySQL FULLTEXT-backed candidate search and respects candidateLimit', async () => {
      await repo.upsert(
        DATA_MART,
        makeRow({ entityId: 'dm-1', document: makeDocument('Revenue Overview') })
      );
      await repo.upsert(
        DATA_MART,
        makeRow({ entityId: 'dm-2', document: makeDocument('Revenue Forecast') })
      );
      await repo.upsert(
        DATA_MART,
        makeRow({ entityId: 'dm-3', document: makeDocument('Storage Inventory') })
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

    it('uses Cloud SQL COSINE_DISTANCE when cloudsql_vector is enabled', async () => {
      const vectorRows: Array<{ Value?: string; value?: string }> = await dataSource
        .query(`SHOW VARIABLES LIKE 'cloudsql_vector'`)
        .catch(() => []);
      const vectorEnabled =
        String(vectorRows[0]?.Value ?? vectorRows[0]?.value ?? '').toUpperCase() === 'ON';

      if (!vectorEnabled) {
        console.log('Skipping COSINE_DISTANCE assertion: cloudsql_vector is not ON');
        return;
      }

      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-near',
          document: makeDocument('Near Vector'),
          embedding: vecToBuffer(new Float32Array([1, 0])),
        })
      );
      await repo.upsert(
        DATA_MART,
        makeRow({
          entityId: 'dm-far',
          document: makeDocument('Far Vector'),
          embedding: vecToBuffer(new Float32Array([0, 1])),
        })
      );

      const page = await repo.searchCandidates(
        DATA_MART,
        'proj-1',
        PASSTHROUGH_PREDICATE,
        'vector',
        {
          candidateLimit: 10,
          vectorCandidateLimit: 2,
          promptVec: new Float32Array([1, 0]),
        }
      );

      expect(page.rows.map(row => row.entityId)).toEqual(['dm-near', 'dm-far']);
    }, 15000);

    it('deleteByEntityId removes one indexed entity', async () => {
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-1' }));
      await repo.upsert(DATA_MART, makeRow({ entityId: 'dm-2' }));

      const deleted = await repo.deleteByEntityId(DATA_MART, 'dm-1');
      const state = await repo.listIndexStateByIds(DATA_MART, ['dm-1', 'dm-2']);

      expect(deleted).toBe(1);
      expect(state.has('dm-1')).toBe(false);
      expect(state.has('dm-2')).toBe(true);
    });
  });
});
