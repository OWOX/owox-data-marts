import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { softDropTable } from './helper';

export class CreateReportDataCacheTable1754139488045 implements MigrationInterface {
  name = 'CreateReportDataCacheTable1754139488045';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'report_data_cache',
        columns: [
          { name: 'id', type: 'varchar', isPrimary: true },
          { name: 'reportId', type: 'varchar', isNullable: false },
          { name: 'dataDescription', type: 'json', isNullable: false },
          { name: 'readerState', type: 'json', isNullable: true },
          { name: 'storageType', type: 'varchar', isNullable: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'expiresAt', type: 'datetime', isNullable: false },
        ],
      }),
      true
    );

    // Add foreign key constraint to report table
    await queryRunner.createForeignKey(
      'report_data_cache',
      new TableForeignKey({
        columnNames: ['reportId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'report',
        onDelete: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await softDropTable(queryRunner, 'report_data_cache');
  }
}
