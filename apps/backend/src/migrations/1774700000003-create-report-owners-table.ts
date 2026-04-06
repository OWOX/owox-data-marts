import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateReportOwnersTable1774700000003 implements MigrationInterface {
  public readonly name = 'CreateReportOwnersTable1774700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('report_owners');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'report_owners',
          columns: [
            { name: 'report_id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'user_id', type: 'varchar', length: '255', isPrimary: true },
          ],
          foreignKeys: [
            {
              columnNames: ['report_id'],
              referencedTableName: 'report',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
        true
      );
      await queryRunner.createIndex(
        'report_owners',
        new TableIndex({ columnNames: ['report_id'] })
      );
      await queryRunner.createIndex('report_owners', new TableIndex({ columnNames: ['user_id'] }));
    }

    // Backfill: insert creator as owner where created_by_id exists
    await queryRunner.query(`
      INSERT INTO report_owners (report_id, user_id)
      SELECT r.id, r.createdById FROM report r
      WHERE r.createdById IS NOT NULL AND r.createdById != ''
      AND NOT EXISTS (
        SELECT 1 FROM report_owners o WHERE o.report_id = r.id AND o.user_id = r.createdById
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('report_owners');
    if (hasTable) {
      await queryRunner.dropTable('report_owners');
    }
  }
}
