import { MigrationInterface, QueryRunner, TableForeignKey, TableIndex } from 'typeorm';

export class AddCascadeToReportDataCacheFk1756904880000 implements MigrationInterface {
  name = 'AddCascadeToReportDataCacheFk1756904880000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ensure table exists
    const table = await queryRunner.getTable('report_data_cache');
    if (!table) {
      throw new Error('Table "report_data_cache" not found');
    }

    // Drop existing FK on reportId if present
    const existingFk = table.foreignKeys.find(
      fk => fk.columnNames.length === 1 && fk.columnNames[0] === 'reportId'
    );
    if (existingFk) {
      await queryRunner.dropForeignKey('report_data_cache', existingFk);
    }

    // Ensure there is an index on reportId (useful/required for MySQL)
    const hasReportIdIndex = table.indices.some(
      idx => idx.columnNames.length === 1 && idx.columnNames[0] === 'reportId'
    );
    if (!hasReportIdIndex) {
      await queryRunner.createIndex(
        'report_data_cache',
        new TableIndex({ name: 'IDX_report_data_cache_reportId', columnNames: ['reportId'] })
      );
    }

    // Create new FK with ON DELETE CASCADE
    await queryRunner.createForeignKey(
      'report_data_cache',
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
    const table = await queryRunner.getTable('report_data_cache');
    if (!table) return;

    // Drop current FK on reportId
    const fk = table.foreignKeys.find(
      f => f.columnNames.length === 1 && f.columnNames[0] === 'reportId'
    );
    if (fk) {
      await queryRunner.dropForeignKey('report_data_cache', fk);
    }

    // Recreate FK without cascade (revert to NO ACTION)
    await queryRunner.createForeignKey(
      'report_data_cache',
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
