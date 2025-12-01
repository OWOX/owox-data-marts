import { MigrationInterface, QueryRunner, TableForeignKey, TableIndex } from 'typeorm';
import { getTable } from './migration-utils';

export class AddCascadeToReportDataCacheFk1756904880000 implements MigrationInterface {
  private readonly TABLE_NAME = 'report_data_cache';
  name = 'AddCascadeToReportDataCacheFk1756904880000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    // Drop existing FK on reportId if present
    const existingFk = table.foreignKeys.find(
      fk => fk.columnNames.length === 1 && fk.columnNames[0] === 'reportId'
    );
    if (existingFk) {
      await queryRunner.dropForeignKey(table, existingFk);
    }

    // Ensure there is an index on reportId (useful/required for MySQL)
    const hasReportIdIndex = table.indices.some(
      idx => idx.columnNames.length === 1 && idx.columnNames[0] === 'reportId'
    );
    if (!hasReportIdIndex) {
      await queryRunner.createIndex(
        table,
        new TableIndex({ name: 'IDX_report_data_cache_reportId', columnNames: ['reportId'] })
      );
    }

    // Create new FK with ON DELETE CASCADE
    await queryRunner.createForeignKey(
      table,
      new TableForeignKey({
        columnNames: ['reportId'],
        referencedTableName: 'report',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await getTable(queryRunner, this.TABLE_NAME);

    // Drop current FK on reportId
    const fk = table.foreignKeys.find(
      f => f.columnNames.length === 1 && f.columnNames[0] === 'reportId'
    );
    if (fk) {
      await queryRunner.dropForeignKey(table, fk);
    }

    // Recreate FK without cascade (revert to NO ACTION)
    await queryRunner.createForeignKey(
      table,
      new TableForeignKey({
        columnNames: ['reportId'],
        referencedTableName: 'report',
        referencedColumnNames: ['id'],
        onDelete: 'NO ACTION',
        onUpdate: 'NO ACTION',
      })
    );
  }
}
