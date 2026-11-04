import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreateManagedStorageTable1793100000000 } from './1793100000000-create-managed-storage-table';

describe('CreateManagedStorageTable migration', () => {
  let dataSource: DataSource;

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.query('CREATE TABLE data_storage (id varchar(36) PRIMARY KEY)');
  });

  afterEach(async () => dataSource.destroy());

  it('creates managed_storage with a unique projectId', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new CreateManagedStorageTable1793100000000();

    await migration.up(runner);
    await migration.up(runner);

    const table = await runner.getTable('managed_storage');
    expect(table?.columns.map(column => column.name).sort()).toEqual(
      [
        'storageId',
        'projectId',
        'engine',
        'gcpProjectId',
        'location',
        'datasetId',
        'internalDatasetId',
        'serviceAccountEmail',
        'storageLimitBytes',
        'queryLimitBytesPerDay',
        'notPaidSince',
        'lastActivityAt',
        'deprovisionedAt',
        'deprovisionPending',
        'createdAt',
        'modifiedAt',
      ].sort()
    );
    const unique = table?.indices.find(index => index.name === 'UQ_managed_storage_projectId');
    expect(unique?.isUnique).toBe(true);
    expect(unique?.columnNames).toEqual(['projectId']);
    expect(table?.foreignKeys.map(key => key.referencedTableName)).toEqual(['data_storage']);
  });

  it('down drops it with softDropTable', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new CreateManagedStorageTable1793100000000();
    await migration.up(runner);

    await migration.down(runner);

    expect(await runner.hasTable('managed_storage')).toBe(false);
    expect(await runner.hasTable('managed_storage_backup')).toBe(true);
  });
});
