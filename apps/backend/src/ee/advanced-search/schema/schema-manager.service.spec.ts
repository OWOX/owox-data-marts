import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import { SchemaManagerService } from './schema-manager.service';

const TABLE = 'data_mart_search_index';

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

async function tableExists(ds: DataSource): Promise<boolean> {
  const rows: { name: string }[] = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
    [TABLE]
  );
  return rows.length > 0;
}

async function indexExists(ds: DataSource, indexName: string): Promise<boolean> {
  const rows: { name: string }[] = await ds.query(
    `SELECT name FROM sqlite_master WHERE type='index' AND name=?`,
    [indexName]
  );
  return rows.length > 0;
}

describe('SchemaManagerService', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createSqliteDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function buildModule(): Promise<SchemaManagerService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaManagerService, { provide: getDataSourceToken(), useValue: dataSource }],
    }).compile();
    return module.get<SchemaManagerService>(SchemaManagerService);
  }

  it('creates table and index on first bootstrap', async () => {
    const service = await buildModule();
    await service.onApplicationBootstrap();

    expect(await tableExists(dataSource)).toBe(true);
    expect(await indexExists(dataSource, 'idx_dmsi_project')).toBe(true);
  });

  it('is idempotent — second bootstrap does not throw', async () => {
    const service = await buildModule();
    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    expect(await tableExists(dataSource)).toBe(true);
  });

  it('created table has expected columns', async () => {
    const cols: { name: string; type: string; notnull: number; pk: number }[] =
      await dataSource.query(`PRAGMA table_info(${TABLE})`);

    const byName = Object.fromEntries(cols.map(c => [c.name, c]));

    expect(byName['data_mart_id'].pk).toBe(1);
    expect(byName['project_id'].notnull).toBe(1);
    expect(byName['embedding']).toBeDefined();
    expect(byName['dim']).toBeDefined();
    expect(byName['doc_hash'].notnull).toBe(1);
    expect(byName['model'].notnull).toBe(1);
    expect(byName['updated_at'].notnull).toBe(1);
  });

  it('does not throw for unsupported DB type', async () => {
    const fakeDs = { options: { type: 'postgres' }, query: jest.fn() } as unknown as DataSource;
    const module: TestingModule = await Test.createTestingModule({
      providers: [SchemaManagerService, { provide: getDataSourceToken(), useValue: fakeDs }],
    }).compile();

    const service = module.get<SchemaManagerService>(SchemaManagerService);
    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
    expect(fakeDs.query).not.toHaveBeenCalled();
  });
});
