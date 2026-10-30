import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';
import { softDropTable } from './migration-utils';

const TABLE = 'managed_storage';

export class CreateManagedStorageTable1792800000000 implements MigrationInterface {
  public readonly name = 'CreateManagedStorageTable1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable(TABLE)) return;

    await queryRunner.createTable(
      new Table({
        name: TABLE,
        columns: [
          { name: 'storageId', type: 'varchar', length: '36', isPrimary: true },
          { name: 'projectId', type: 'varchar', length: '255' },
          { name: 'engine', type: 'varchar', length: '32' },
          { name: 'gcpProjectId', type: 'varchar', length: '255' },
          { name: 'location', type: 'varchar', length: '16' },
          { name: 'datasetId', type: 'varchar', length: '255' },
          { name: 'internalDatasetId', type: 'varchar', length: '255' },
          { name: 'serviceAccountEmail', type: 'varchar', length: '255' },
          { name: 'storageLimitBytes', type: 'bigint', isNullable: true },
          { name: 'queryLimitBytesPerDay', type: 'bigint', isNullable: true },
          { name: 'notPaidSince', type: 'datetime', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'modifiedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
        indices: [
          new TableIndex({
            name: 'UQ_managed_storage_projectId',
            columnNames: ['projectId'],
            isUnique: true,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['storageId'],
            referencedTableName: 'data_storage',
            referencedColumnNames: ['id'],
            onDelete: 'NO ACTION',
            onUpdate: 'NO ACTION',
          }),
        ],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, TABLE);
  }
}
