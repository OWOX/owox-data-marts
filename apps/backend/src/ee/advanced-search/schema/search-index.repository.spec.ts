import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SchemaManagerService } from './schema-manager.service';
import { SearchIndexRepository, SearchIndexRow } from './search-index.repository';

async function createSqliteDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [],
    synchronize: false,
    logging: false,
  });
  await ds.initialize();
  return ds;
}

function float32Buffer(values: number[]): Buffer {
  const arr = new Float32Array(values);
  return Buffer.from(arr.buffer);
}

function bufferToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

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

describe('SearchIndexRepository', () => {
  let dataSource: DataSource;
  let repo: SearchIndexRepository;

  beforeAll(async () => {
    dataSource = await createSqliteDataSource();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchemaManagerService,
        SearchIndexRepository,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    const schemaMgr = module.get<SchemaManagerService>(SchemaManagerService);
    await schemaMgr.onApplicationBootstrap();

    repo = module.get<SearchIndexRepository>(SearchIndexRepository);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query('DELETE FROM data_mart_search_index');
  });

  describe('upsert', () => {
    it('inserts a new row', async () => {
      await repo.upsert(makeRow());
      const hashes = await repo.listHashes();
      expect(hashes.get('dm-1')).toBe('abc123');
    });

    it('updates an existing row on conflict', async () => {
      await repo.upsert(makeRow({ docHash: 'old-hash' }));
      await repo.upsert(makeRow({ docHash: 'new-hash' }));

      const hashes = await repo.listHashes();
      expect(hashes.size).toBe(1);
      expect(hashes.get('dm-1')).toBe('new-hash');
    });

    it('round-trips a Buffer embedding', async () => {
      const values = [0.1, 0.2, 0.3, 0.4];
      const buf = float32Buffer(values);
      await repo.upsert(makeRow({ embedding: buf, dim: 4 }));

      const rows = await repo.listByProject('proj-1');
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
      await repo.upsert(makeRow({ embedding: null, dim: null }));
      const rows = await repo.listByProject('proj-1');
      expect(rows[0].embedding).toBeNull();
    });
  });

  describe('listByProject', () => {
    it('returns only rows matching projectId', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1', projectId: 'proj-1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', projectId: 'proj-2' }));

      const result = await repo.listByProject('proj-1');
      expect(result).toHaveLength(1);
      expect(result[0].dataMartId).toBe('dm-1');
    });

    it('returns empty array when project has no rows', async () => {
      const result = await repo.listByProject('no-such-project');
      expect(result).toHaveLength(0);
    });
  });

  describe('listHashes', () => {
    it('returns all hashes when no projectId given', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1', projectId: 'proj-1', docHash: 'h1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', projectId: 'proj-2', docHash: 'h2' }));

      const map = await repo.listHashes();
      expect(map.size).toBe(2);
      expect(map.get('dm-1')).toBe('h1');
      expect(map.get('dm-2')).toBe('h2');
    });

    it('filters by projectId', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1', projectId: 'proj-1', docHash: 'h1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2', projectId: 'proj-2', docHash: 'h2' }));

      const map = await repo.listHashes('proj-1');
      expect(map.size).toBe(1);
      expect(map.get('dm-1')).toBe('h1');
    });

    it('returns empty map when table is empty', async () => {
      const map = await repo.listHashes();
      expect(map.size).toBe(0);
    });
  });

  describe('deleteAllExcept', () => {
    it('deletes all rows when liveIds is empty', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1' }));
      await repo.upsert(makeRow({ dataMartId: 'dm-2' }));

      const deleted = await repo.deleteAllExcept(new Set());
      expect(deleted).toBe(2);

      const hashes = await repo.listHashes();
      expect(hashes.size).toBe(0);
    });

    it('keeps only live ids', async () => {
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

    it('returns 0 when nothing to delete', async () => {
      await repo.upsert(makeRow({ dataMartId: 'dm-1' }));

      const deleted = await repo.deleteAllExcept(new Set(['dm-1']));
      expect(deleted).toBe(0);
    });
  });

  describe('maxUpdatedAt', () => {
    it('returns null when table is empty', async () => {
      const result = await repo.maxUpdatedAt();
      expect(result).toBeNull();
    });

    it('returns latest updatedAt as ISO string', async () => {
      await repo.upsert(
        makeRow({ dataMartId: 'dm-1', updatedAt: new Date('2024-01-01T10:00:00.000Z') })
      );
      await repo.upsert(
        makeRow({ dataMartId: 'dm-2', updatedAt: new Date('2024-06-15T12:30:00.000Z') })
      );

      const result = await repo.maxUpdatedAt();
      expect(result).not.toBeNull();
      expect(new Date(result!).getTime()).toBe(new Date('2024-06-15T12:30:00.000Z').getTime());
    });

    it('filters by projectId', async () => {
      await repo.upsert(
        makeRow({
          dataMartId: 'dm-1',
          projectId: 'proj-1',
          updatedAt: new Date('2024-06-15T12:30:00.000Z'),
        })
      );
      await repo.upsert(
        makeRow({
          dataMartId: 'dm-2',
          projectId: 'proj-2',
          updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        })
      );

      const result = await repo.maxUpdatedAt('proj-1');
      expect(result).not.toBeNull();
      expect(new Date(result!).getTime()).toBe(new Date('2024-06-15T12:30:00.000Z').getTime());
    });

    it('returns null when projectId has no rows', async () => {
      await repo.upsert(makeRow({ projectId: 'proj-1' }));
      const result = await repo.maxUpdatedAt('proj-2');
      expect(result).toBeNull();
    });
  });
});
