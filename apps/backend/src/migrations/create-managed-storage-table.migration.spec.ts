import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreateManagedStorageTable1795564800000 } from './1795564800000-create-managed-storage-table';

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

  it('creates managed_storage with one storage per project and location', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new CreateManagedStorageTable1795564800000();

    await migration.up(runner);
    await migration.up(runner);

    const table = await runner.getTable('managed_storage');
    expect(table?.columns.map(column => column.name).sort()).toEqual(
      [
        'storageId',
        'projectId',
        'engine',
        'gcpProjectId',
        'processProjectId',
        'location',
        'datasetId',
        'internalDatasetId',
        'serviceAccountEmail',
        'storageLimitBytes',
        'deprovisionedAt',
        'deprovisionPending',
        'createdAt',
        'modifiedAt',
      ].sort()
    );
    const unique = table?.indices.find(
      index => index.name === 'UQ_managed_storage_projectId_location'
    );
    expect(unique?.isUnique).toBe(true);
    expect(unique?.columnNames).toEqual(['projectId', 'location']);
    expect(table?.foreignKeys.map(key => key.referencedTableName)).toEqual(['data_storage']);
  });

  it('down drops it with softDropTable', async () => {
    const runner = dataSource.createQueryRunner();
    const migration = new CreateManagedStorageTable1795564800000();
    await migration.up(runner);

    await migration.down(runner);

    expect(await runner.hasTable('managed_storage')).toBe(false);
    expect(await runner.hasTable('managed_storage_backup')).toBe(true);
  });
});
