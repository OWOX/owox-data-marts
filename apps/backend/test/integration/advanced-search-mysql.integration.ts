import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SchemaManagerService } from 'src/ee/advanced-search/schema/schema-manager.service';
import {
  SearchIndexRepository,
  SearchIndexRow,
} from 'src/ee/advanced-search/schema/search-index.repository';
import { bufferToVec, vecToBuffer } from 'src/ee/advanced-search/embedding/vector-codec';

const MYSQL_HOST = process.env.ADVANCED_SEARCH_MYSQL_HOST;
const MYSQL_PORT = parseInt(process.env.ADVANCED_SEARCH_MYSQL_PORT ?? '3306', 10);
const MYSQL_USER = process.env.ADVANCED_SEARCH_MYSQL_USER ?? 'root';
const MYSQL_PASSWORD = process.env.ADVANCED_SEARCH_MYSQL_PASSWORD;
const MYSQL_DATABASE = process.env.ADVANCED_SEARCH_MYSQL_DATABASE ?? 'owox_test';

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

describeIfAvailable('Advanced Search — MySQL schema layer (integration)', () => {
  let dataSource: DataSource;
  let schemaManager: SchemaManagerService;
  let repo: SearchIndexRepository;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mysql',
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      username: MYSQL_USER,
      password: MYSQL_PASSWORD!,
      database: MYSQL_DATABASE,
      entities: [],
      synchronize: false,
      logging: false,
    });
    await dataSource.initialize();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchemaManagerService,
        SearchIndexRepository,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    schemaManager = module.get<SchemaManagerService>(SchemaManagerService);
    repo = module.get<SearchIndexRepository>(SearchIndexRepository);
  }, 30000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('DROP TABLE IF EXISTS data_mart_search_index').catch(() => undefined);
      await dataSource.destroy();
    }
  }, 15000);

  afterEach(async () => {
    await dataSource.query('DELETE FROM data_mart_search_index');
  });

  function makeRow(overrides: Partial<SearchIndexRow> = {}): SearchIndexRow {
    return {
      dataMartId: 'dm-1',
      projectId: 'proj-1',
      embedding: null,
      dim: null,
      docHash: 'abc123',
      model: 'test-model',
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  describe('SchemaManagerService.bootstrap', () => {
    it('creates table and index on first call', async () => {
      await schemaManager.onApplicationBootstrap();

      const tables: { TABLE_NAME: string }[] = await dataSource.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'data_mart_search_index'`,
        [MYSQL_DATABASE]
      );
      expect(tables).toHaveLength(1);

      const indexes: { INDEX_NAME: string }[] = await dataSource.query(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'data_mart_search_index' AND INDEX_NAME = 'idx_dmsi_project'`,
        [MYSQL_DATABASE]
      );
      expect(indexes.length).toBeGreaterThanOrEqual(1);
    }, 15000);

    it('is idempotent — second bootstrap succeeds without error', async () => {
      await schemaManager.onApplicationBootstrap();
      await expect(schemaManager.onApplicationBootstrap()).resolves.not.toThrow();
    }, 15000);

    it('idempotency covers duplicate-index path (ER_DUP_KEYNAME 1061)', async () => {
      await schemaManager.onApplicationBootstrap();
      await expect(schemaManager.onApplicationBootstrap()).resolves.not.toThrow();

      const tables: { TABLE_NAME: string }[] = await dataSource.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'data_mart_search_index'`,
        [MYSQL_DATABASE]
      );
      expect(tables).toHaveLength(1);
    }, 15000);
  });

  describe('SearchIndexRepository — upsert', () => {
    beforeEach(async () => {
      await schemaManager.onApplicationBootstrap();
    });

    it('inserts a new row', async () => {
      await repo.upsert(makeRow({ docHash: 'hash-insert' }));
      const hashes = await repo.listHashes();
      expect(hashes.get('dm-1')).toBe('hash-insert');
    });

    it('updates existing row on same PK (ON DUPLICATE KEY UPDATE)', async () => {
      await repo.upsert(makeRow({ docHash: 'old-hash' }));
      await repo.upsert(makeRow({ docHash: 'new-hash' }));

      const hashes = await repo.listHashes();
      expect(hashes.size).toBe(1);
      expect(hashes.get('dm-1')).toBe('new-hash');
    });

    it('stores null embedding without error', async () => {
      await repo.upsert(makeRow({ embedding: null, dim: null }));
      const rows = await repo.listByProject('proj-1');
      expect(rows[0].embedding).toBeNull();
    });
  });

  describe('SearchIndexRepository — BLOB/Float32Array round-trip', () => {
    beforeEach(async () => {
      await schemaManager.onApplicationBootstrap();
    });

    it('stores and retrieves Float32Array byte-identical via vecToBuffer/bufferToVec', async () => {
      const original = new Float32Array([0.1, 0.2, 0.3, 0.4, -0.5, 0.9999]);
      const buf = vecToBuffer(original);

      await repo.upsert(makeRow({ embedding: buf, dim: original.length }));

      const rows = await repo.listByProject('proj-1');
      expect(rows).toHaveLength(1);

      const readBack = rows[0].embedding;
      expect(readBack).not.toBeNull();

      const recovered = bufferToVec(readBack!);
      expect(recovered.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(recovered[i]).toBeCloseTo(original[i]!, 5);
      }
    });

    it('round-trips 384-dimensional embedding (production dimension)', async () => {
      const data = new Float32Array(384).map((_, i) => Math.sin(i * 0.01));
      const buf = vecToBuffer(data);

      await repo.upsert(makeRow({ embedding: buf, dim: 384 }));

      const rows = await repo.listByProject('proj-1');
      const recovered = bufferToVec(rows[0].embedding!);

      expect(recovered.length).toBe(384);
      for (let i = 0; i < 384; i++) {
        expect(recovered[i]).toBeCloseTo(data[i]!, 5);
      }
    });
  });

  describe('SearchIndexRepository — listByProject scoping', () => {
    beforeEach(async () => {
      await schemaManager.onApplicationBootstrap();
    });

    it('returns only rows for the requested projectId', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1', projectId: 'proj-A' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', projectId: 'proj-B' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-3', projectId: 'proj-A' }));

      const result = await repo.listByProject('proj-A');
      expect(result).toHaveLength(2);
      const ids = result.map(r => r.dataMartId).sort();
      expect(ids).toEqual(['dm-1', 'dm-3']);
    });

    it('returns empty array for unknown projectId', async () => {
      await repo.upsert(makeRow({ projectId: 'proj-A' }));
      const result = await repo.listByProject('proj-Z');
      expect(result).toHaveLength(0);
    });
  });

  describe('SearchIndexRepository — listHashes', () => {
    beforeEach(async () => {
      await schemaManager.onApplicationBootstrap();
    });

    it('returns all hashes when projectId is omitted', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1', projectId: 'proj-1', docHash: 'h1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', projectId: 'proj-2', docHash: 'h2' }));

      const map = await repo.listHashes();
      expect(map.size).toBe(2);
      expect(map.get('dm-1')).toBe('h1');
      expect(map.get('dm-2')).toBe('h2');
    });

    it('filters hashes by projectId', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1', projectId: 'proj-1', docHash: 'h1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', projectId: 'proj-2', docHash: 'h2' }));

      const map = await repo.listHashes('proj-1');
      expect(map.size).toBe(1);
      expect(map.get('dm-1')).toBe('h1');
    });
  });

  describe('SearchIndexRepository — deleteAllExcept', () => {
    beforeEach(async () => {
      await schemaManager.onApplicationBootstrap();
    });

    it('deletes all rows when liveIds is empty', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2' }));

      const deleted = await repo.deleteAllExcept(new Set());
      expect(deleted).toBe(2);

      const hashes = await repo.listHashes();
      expect(hashes.size).toBe(0);
    });

    it('keeps only liveIds and removes orphans', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-3' }));

      await repo.deleteAllExcept(new Set(['dm-1', 'dm-3']));

      const hashes = await repo.listHashes();
      expect(hashes.size).toBe(2);
      expect(hashes.has('dm-1')).toBe(true);
      expect(hashes.has('dm-2')).toBe(false);
      expect(hashes.has('dm-3')).toBe(true);
    });

    it('returns 0 when all rows are live', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1' }));
      const deleted = await repo.deleteAllExcept(new Set(['dm-1']));
      expect(deleted).toBe(0);
    });
  });

  describe('SearchIndexRepository — maxUpdatedAt ordering', () => {
    beforeEach(async () => {
      await schemaManager.onApplicationBootstrap();
    });

    it('returns null for empty table', async () => {
      const result = await repo.maxUpdatedAt();
      expect(result).toBeNull();
    });

    it('returns the latest updatedAt across all rows', async () => {
      const early = new Date('2024-01-01T10:00:00.000Z');
      const latest = new Date('2024-06-15T12:30:00.000Z');
      const oldest = new Date('2023-12-31T23:59:00.000Z');

      await repo.upsert(makeRow({ dataMartId: 'dm-1', updatedAt: early }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', updatedAt: latest }));
      await repo.upsert(makeRow({ dataMartId: 'dm-3', updatedAt: oldest }));

      const result = await repo.maxUpdatedAt();
      expect(result).not.toBeNull();

      const allResults = await Promise.all([repo.maxUpdatedAt(), repo.maxUpdatedAt()]);
      const t0 = new Date(allResults[0]!).getTime();
      const t1 = new Date(allResults[1]!).getTime();
      expect(t0).toBe(t1);

      const earlyResult = await (async () => {
        await dataSource.query('DELETE FROM data_mart_search_index');
        await repo.upsert(makeRow({ dataMartId: 'dm-early', updatedAt: early }));
        return repo.maxUpdatedAt();
      })();

      const latestResult = await (async () => {
        await dataSource.query('DELETE FROM data_mart_search_index');
        await repo.upsert(makeRow({ dataMartId: 'dm-latest', updatedAt: latest }));
        return repo.maxUpdatedAt();
      })();

      expect(new Date(latestResult!).getTime()).toBeGreaterThan(new Date(earlyResult!).getTime());
    });

    it('filters maxUpdatedAt by projectId', async () => {
      const proj1Date = new Date('2024-06-15T12:30:00.000Z');
      const proj2Date = new Date('2025-01-01T00:00:00.000Z');

      await repo.upsert(makeRow({ dataMartId: 'dm-1', projectId: 'proj-1', updatedAt: proj1Date }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', projectId: 'proj-2', updatedAt: proj2Date }));

      const proj1Result = await repo.maxUpdatedAt('proj-1');
      const proj2Result = await repo.maxUpdatedAt('proj-2');

      expect(proj1Result).not.toBeNull();
      expect(proj2Result).not.toBeNull();
      expect(new Date(proj2Result!).getTime()).toBeGreaterThan(new Date(proj1Result!).getTime());
    });

    it('returns null when projectId has no rows', async () => {
      await repo.upsert(makeRow({ projectId: 'proj-1' }));
      const result = await repo.maxUpdatedAt('proj-Z');
      expect(result).toBeNull();
    });
  });
});
