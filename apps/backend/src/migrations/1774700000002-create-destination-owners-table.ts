import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDestinationOwnersTable1774700000002 implements MigrationInterface {
  public readonly name = 'CreateDestinationOwnersTable1774700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('destination_owners');
    if (!hasTable) {
      await queryRunner.createTable(
        new Table({
          name: 'destination_owners',
          columns: [
            { name: 'destination_id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'user_id', type: 'varchar', length: '255', isPrimary: true },
          ],
          foreignKeys: [
            {
              columnNames: ['destination_id'],
              referencedTableName: 'data_destination',
              referencedColumnNames: ['id'],
              onDelete: 'CASCADE',
            },
          ],
        }),
        true
      );
      await queryRunner.createIndex(
        'destination_owners',
        new TableIndex({ columnNames: ['destination_id'] })
      );
      await queryRunner.createIndex(
        'destination_owners',
        new TableIndex({ columnNames: ['user_id'] })
      );
    }

    // Backfill: insert creator as owner where created_by_id exists
    await queryRunner.query(`
      INSERT INTO destination_owners (destination_id, user_id)
      SELECT d.id, d.createdById FROM data_destination d
      WHERE d.createdById IS NOT NULL AND d.createdById != ''
      AND NOT EXISTS (
        SELECT 1 FROM destination_owners o WHERE o.destination_id = d.id AND o.user_id = d.createdById
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasTable = await queryRunner.hasTable('destination_owners');
    if (hasTable) {
      await queryRunner.dropTable('destination_owners');
    }
  }
}
